/** Small in-memory sliding-window limiter for the public demo. Per process, resets on restart. */
export type Limits = { perKey: number; global: number; windowMs: number };
export type Verdict = { ok: true } | { ok: false; reason: "key" | "global"; retryAfterSec: number };

const MAX_KEYS = 10_000;

/** A bare hostname as returned by the logo lookup, e.g. "volvocars.com". */
export const SITE = /^(?=.{3,120}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,22}[a-z0-9])$/;

export function createLimiter(limits: () => Limits) {
  const hits = new Map<string, number[]>();
  let all: number[] = [];

  const prune = (now: number, windowMs: number) => {
    all = all.filter((t) => now - t < windowMs);
    for (const [k, ts] of hits) {
      const live = ts.filter((t) => now - t < windowMs);
      if (live.length) hits.set(k, live);
      else hits.delete(k);
    }
  };

  return {
    /** Records a hit if allowed. */
    take(key: string, now = Date.now()): Verdict {
      const { perKey, global, windowMs } = limits();
      prune(now, windowMs);
      const mine = hits.get(key) ?? [];
      const retry = (ts: number[]) => Math.max(1, Math.ceil((windowMs - (now - ts[0])) / 1000));
      if (all.length >= global) return { ok: false, reason: "global", retryAfterSec: all.length ? retry(all) : Math.ceil(windowMs / 1000) };
      if (mine.length >= perKey) return { ok: false, reason: "key", retryAfterSec: mine.length ? retry(mine) : Math.ceil(windowMs / 1000) };
      if (!hits.has(key) && hits.size >= MAX_KEYS) hits.clear();
      hits.set(key, [...mine, now]);
      all.push(now);
      return { ok: true };
    },
  };
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
export const envInt = (name: string, fallback: number) => int(process.env[name], fallback);

/** Railway sets X-Real-IP; otherwise the rightmost X-Forwarded-For entry is the one our proxy added. */
export function clientIp(req: Request) {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return fwd?.length ? fwd[fwd.length - 1].slice(0, 64) : "unknown";
}

/** Reads a JSON body with a hard size cap. Returns undefined when too large, null when not JSON. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return undefined;
  const text = await req.text().catch(() => "");
  if (Buffer.byteLength(text) > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Free text that ends up in prompts or stored quotes: no quotes, newlines, control or markup characters. */
export function cleanText(raw: string, max: number) {
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} &.,+!?'’/()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}
