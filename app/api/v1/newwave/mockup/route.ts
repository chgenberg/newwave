import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { nwProduct, printOf } from "@/lib/newwave/catalog";
import { MOCKUP_VERSION } from "@/lib/newwave/printSurface";
import { mockupJpeg } from "@/lib/newwave/serverMockup";

/** Produktfotot med loggan tryckt, som butiken visar. Ritas en gång per produkt, logga och storlek och sparas sedan. */

const SIZES = new Set([480, 800, 1200]);
const DIR = path.join(process.cwd(), ".data", "newwave", "mockups");
const PARALLEL = 3;

let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await job();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const p = nwProduct(q.get("p") ?? "");
  const logo = q.get("l") ?? "";
  const size = Number(q.get("s") ?? 800);
  const zone = q.get("z") ?? undefined;
  if (!p || !logo || logo.length > 300 || !SIZES.has(size) || (zone && zone.length > 20)) return new Response("Ogiltig förfrågan", { status: 400 });

  const key = createHash("sha256").update(JSON.stringify([MOCKUP_VERSION, p.photo, printOf(p, zone), p.dark, p.kind, logo, size])).digest("hex").slice(0, 40);
  const file = path.join(DIR, `${key}.jpg`);
  let jpg: Buffer | null = await readFile(file).catch(() => null);
  if (!jpg) {
    jpg = await limited(() => mockupJpeg(p, logo, size, zone));
    if (!jpg) return new Response("Hittades inte", { status: 404 });
    await mkdir(DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    await writeFile(tmp, jpg);
    await rename(tmp, file);
  }
  return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" } });
}
