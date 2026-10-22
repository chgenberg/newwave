import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { isWorkspaceId, WS_COOKIE, WS_MAX_AGE } from "./workspaceId";

/**
 * Varje besökare får en egen kopia av demodatan. Läsning tar besökarens fil om den finns, annars grunddatan;
 * skrivning hamnar bara i besökarens kopia. Anrop utan cookie (webhooks, externa API-anrop) använder grunddatan.
 * `rel` är alltid en sökväg som anroparen byggt av rensade id:n. Med `shared` gäller grunddatan för alla, t.ex. det
 * klubbar svarat via sin personliga länk.
 */

const ROOT = path.join(process.cwd(), ".data");
const WS_ROOT = path.join(ROOT, "ws");
const STALE_MS = WS_MAX_AGE * 1000;

export async function workspaceId() {
  try {
    const id = (await cookies()).get(WS_COOKIE)?.value;
    return isWorkspaceId(id) ? id : null;
  } catch {
    return null;
  }
}

type Opts = { shared?: boolean };

export async function readData(rel: string, opts: Opts = {}): Promise<string | null> {
  const id = opts.shared ? null : await workspaceId();
  for (const base of id ? [path.join(WS_ROOT, id), ROOT] : [ROOT]) {
    try {
      return await readFile(path.join(base, rel), "utf8");
    } catch {}
  }
  return null;
}

export async function writeData(rel: string, data: string, opts: Opts = {}) {
  const id = opts.shared ? null : await workspaceId();
  const base = id ? path.join(WS_ROOT, id) : ROOT;
  if (id && !(await stat(base).catch(() => null))) void prune();
  const file = path.join(base, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  if (id) {
    const now = new Date();
    await utimes(base, now, now);
  }
}

/** Tar bort besökarens kopia, så att demon börjar om från grunddatan. */
export async function resetWorkspace() {
  const id = await workspaceId();
  if (id) await rm(path.join(WS_ROOT, id), { recursive: true, force: true });
}

async function prune() {
  const now = Date.now();
  const dirs = await readdir(WS_ROOT).catch(() => [] as string[]);
  await Promise.all(
    dirs.map(async (d) => {
      const p = path.join(WS_ROOT, d);
      const s = await stat(p).catch(() => null);
      if (s && now - s.mtimeMs > STALE_MS) await rm(p, { recursive: true, force: true });
    }),
  );
}
