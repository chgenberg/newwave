import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { paletteFor, type Rendered, renderWordmark, type WordmarkClub, wordmarkPng } from "./render";
import type { Template } from "./schema";
import { WORDMARK_VERSION, type WordmarkQuery } from "./spec";
import { findTemplate, wordmarkClub } from "./store";
import { smallFor } from "./templates";

const DIR = path.join(process.cwd(), ".data", "newwave", "wordmarks", "cache");

async function cached(parts: unknown[], ext: string, make: () => Promise<Buffer>) {
  const key = createHash("sha256").update(JSON.stringify([WORDMARK_VERSION, ...parts])).digest("hex").slice(0, 40);
  const file = path.join(DIR, `${key}.${ext}`);
  const hit = await readFile(file).catch(() => null);
  if (hit) return hit;
  const data = await make();
  await mkdir(DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
  return data;
}

/** Mallen och klubben för förfrågan; små tryck får mallens lilla version. */
async function resolve(q: WordmarkQuery): Promise<{ template: Template; club: WordmarkClub } | null> {
  const [base, club] = [await findTemplate(q.template), await wordmarkClub(q.club)];
  const template = base && q.compact && !base.hidden ? ((await findTemplate(smallFor(base))) ?? base) : base;
  return template && club ? { template, club } : null;
}

const draw = (t: Template, club: WordmarkClub, q: WordmarkQuery, animate = false) =>
  renderWordmark(t, club, { name1: q.name1, name2: q.name2, team: q.team, player: q.player, number: q.number, icon: q.icon, ornament: q.ornament, worn: q.worn, variant: q.variant, animate });

/** Ordmärket som SVG eller PNG; ritas en gång per mall, klubb, namn och storlek och sparas sedan. */
export async function wordmarkFile(q: WordmarkQuery): Promise<{ data: Buffer; type: string } | null> {
  const r = await resolve(q);
  if (!r) return null;
  const data = await cached([r.template, r.club, q], q.format, async () => {
    const out = await draw(r.template, r.club, q);
    return q.format === "svg" ? Buffer.from(out.svg) : wordmarkPng(out, q.size);
  });
  return { data, type: q.format === "svg" ? "image/svg+xml" : "image/png" };
}

/** Format för sociala medier: profilbild, omslag/banner, story och ett animerat ordmärke för webben. */
export const SOCIAL = {
  profil: { label: "Profilbild", w: 1080, h: 1080, fit: [0.7, 0.7] },
  banner: { label: "Omslagsbild", w: 1500, h: 500, fit: [0.8, 0.72] },
  story: { label: "Story", w: 1080, h: 1920, fit: [0.8, 0.5] },
  anim: { label: "Animerat ordmärke", w: 1200, h: 1200, fit: [0.8, 0.8] },
} as const;
export type SocialFormat = keyof typeof SOCIAL;

/** Ordmärket centrerat på klubbens huvudfärg i formatets mått. */
function onBackground(r: Rendered, f: (typeof SOCIAL)[SocialFormat], bg: string) {
  const s = Math.min((f.w * f.fit[0]) / r.width, (f.h * f.fit[1]) / r.height);
  const [w, h] = [r.width * s, r.height * s];
  const inner = r.svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" (viewBox="[^"]+") width="[^"]+" height="[^"]+">/, `<svg x="${((f.w - w) / 2).toFixed(1)}" y="${((f.h - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" $1>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.w}" height="${f.h}" viewBox="0 0 ${f.w} ${f.h}"><rect width="${f.w}" height="${f.h}" fill="${bg}"/>${inner}</svg>`;
}

export async function socialFile(q: WordmarkQuery, format: SocialFormat): Promise<{ data: Buffer; type: string } | null> {
  const r = await resolve({ ...q, variant: "club" });
  if (!r) return null;
  const query = { ...q, variant: "club" as const };
  const f = SOCIAL[format];
  const bg = paletteFor(r.club.colors, "club").paper;
  const anim = format === "anim";
  const data = await cached([r.template, r.club, query, format], anim ? "svg" : "png", async () => {
    const svg = onBackground(await draw(r.template, r.club, query, anim), f, bg);
    return anim ? Buffer.from(svg) : sharp(Buffer.from(svg), { limitInputPixels: 80_000_000 }).png({ compressionLevel: 8 }).toBuffer();
  });
  return { data, type: anim ? "image/svg+xml" : "image/png" };
}
