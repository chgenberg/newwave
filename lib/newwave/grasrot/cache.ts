import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Gräsrot 360-filerna byggs en gång per deploy och sparas på disk tills nästa version är ute; produktionsbladen startar
 * en webbläsare och paketet tar en halv minut. Utan commit-id (och under utveckling) byggs de om varje gång.
 */

const CACHE = path.join(process.cwd(), ".data", "newwave", "grasrot");
const SHA = process.env.RAILWAY_GIT_COMMIT_SHA;
const VERSION = process.env.NODE_ENV === "production" && SHA ? SHA.slice(0, 12) : null;
const running = new Map<string, Promise<Buffer | null>>();
let pruned: Promise<void> | null = null;

/** Tidigare versioners filer tas bort första gången den nya versionen sparar något. */
const prune = () =>
  (pruned ??= readdir(CACHE)
    .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => rm(path.join(CACHE, n), { recursive: true, force: true }))))
    .then(() => undefined, () => undefined));

async function save(disk: string, data: Buffer) {
  await prune();
  await mkdir(path.dirname(disk), { recursive: true });
  await writeFile(`${disk}.tmp`, data);
  await rename(`${disk}.tmp`, disk);
}

/** `keep` avgör efter bygget om filen får sparas; ett paket där något fattas byggs om nästa gång. */
export async function stored(id: string, file: string, build: () => Promise<Buffer | null>, keep: () => boolean = () => true): Promise<Buffer | null> {
  const disk = VERSION ? path.join(CACHE, VERSION, id, file) : null;
  if (disk) {
    const hit = await readFile(disk).catch(() => null);
    if (hit) return hit;
  }
  const key = `${id}/${file}`;
  let job = running.get(key);
  if (!job) {
    job = build()
      .then(async (data) => {
        if (data && disk && keep()) await save(disk, data).catch((err) => console.error("[grasrot] kunde inte spara", file, err));
        return data;
      })
      .finally(() => running.delete(key));
    running.set(key, job);
  }
  return job;
}
