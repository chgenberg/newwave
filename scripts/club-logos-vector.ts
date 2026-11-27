// Klubbmärken till vektor: det bästa märke som club-logos-hd.mjs hittade (eller registrets, om det är tillräckligt stort)
// ritas om som vektorer med samma motor som designimporten (lib/newwave/wordmark/convert.ts), så att märket kan tryckas
// i alla storlekar. Vektorn ritas sedan tillbaka till bild och jämförs med originalet bildpunkt för bildpunkt; bara en
// trogen kopia godkänns. Registret rörs inte – resultatet läggs bredvid, som <id>.vektor.svg och <id>.vektor.json.
//
//   NODE_PATH=node_modules node_modules/.bin/jiti scripts/club-logos-vector.ts run <idfil|id,id> [--del=1/4] [--force]
//   NODE_PATH=node_modules node_modules/.bin/jiti scripts/club-logos-vector.ts sheet <idfil> <utmapp>
//   NODE_PATH=node_modules node_modules/.bin/jiti scripts/club-logos-vector.ts status      grupperna till klubbregistret
//
// --del=k/n kör var n:te klubb med början på k, så att flera processer kan dela på arbetet.

import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { Potrace } from "potrace";
import sharp, { type OverlayOptions, type Sharp } from "sharp";
import type { VectorKind, VectorStatus } from "../lib/newwave/clubVector";
import { convertDesign } from "../lib/newwave/wordmark/convert";

const ROOT = path.join(process.cwd(), ".data", "newwave", "clubs");
const HD = path.join(ROOT, "logos-hd");
/** Minsta långsida som går att rita om; under det blir småtext och detaljer gissningar. */
const MIN_PX = 160;
/** Högsta andel av märkets bildpunkter som får skilja sig tydligt mellan original och vektor. */
const MAX_MISMATCH = 0.06;
/** Samma storlek som designimporten ritar om i (SIDE i convert.ts), så att siluetten hamnar rätt. */
const SIDE = 1600;
const MODEL = process.env.LOGO_MODEL || "gpt-5-mini";
/** Klubbar som agenten ännu inte granskat, eller vars sajt inte svarade, väntar till nästa körning. */
const PENDING = "väntar";

const args = process.argv.slice(2);
const has = (k: string) => args.includes(`--${k}`);
const flag = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const log = (...m: unknown[]) => console.log(new Date().toLocaleTimeString("sv-SE"), ...m);

type HdRecord = { id: string; name: string; status: string; before: { long: number }; after: { file: string; vector: boolean; long: number | null } | null };

export type VectorRecord = {
  id: string;
  name: string;
  at: string;
  ok: boolean;
  /** Varifrån bilden kom: det högupplösta märket agenten hittade, eller registrets. */
  from: "hd" | "registret" | null;
  srcLong: number | null;
  colors: number | null;
  /** Andel av märkets bildpunkter som skiljer sig tydligt mellan original och vektor. */
  mismatch: number | null;
  file: string | null;
  reason: string | null;
  /** Bildmodellens bedömning av omritningen: trogen och med läsbar text. */
  review?: { ok: boolean; issue: string } | null;
};

/** Märket som ska ritas om: det agenten hittade, annars registrets – om det är stort nog. */
async function source(id: string, rec: HdRecord | null) {
  if (rec?.after && !rec.after.vector) {
    const f = path.join(HD, rec.after.file);
    if (existsSync(f)) return { buf: await readFile(f), from: "hd" as const };
  }
  const f = path.join(ROOT, "logos", `${id}.png`);
  return existsSync(f) ? { buf: await readFile(f), from: "registret" as const } : null;
}

/**
 * Hur trogen vektorn är: båda ritas på vitt i samma storlek, och andelen av märkets bildpunkter (de som inte är
 * bakgrund i någon av bilderna) där färgen skiljer sig tydligt räknas. Kanterna får vara lite mjukare i originalet.
 */
async function mismatch(original: Buffer, svg: string) {
  const W = 600;
  const flat = (img: Sharp) => img.flatten({ background: "#FFFFFF" }).resize(W, W, { fit: "contain", background: "#FFFFFF" }).removeAlpha().blur(1).raw().toBuffer();
  const [a, b] = await Promise.all([flat(sharp(original)), flat(sharp(Buffer.from(svg), { density: 150 }))]);
  let ink = 0;
  let off = 0;
  for (let i = 0; i < a.length; i += 3) {
    const white = (x: Buffer) => x[i] > 245 && x[i + 1] > 245 && x[i + 2] > 245;
    if (white(a) && white(b)) continue;
    ink++;
    const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]);
    if (d > 70) off++;
  }
  return ink ? off / ink : 1;
}

/**
 * Märkets siluett i bakgrundens färg, att lägga underst. Designimporten tar bort bakgrundsfärgen överallt – rätt för
 * ett ordmärke, men i ett klubbmärke är det vita inne i skölden en del av märket och ska synas vitt även på ett mörkt
 * plagg. Bakgrunden avgörs som i importen (genomskinlig kant, annars kantens vanligaste färg); det som inte går att nå
 * från kanten genom bakgrund är märket. Siluetten krymps två bildpunkter så att den aldrig sticker ut bakom kanten.
 */
async function underlay(png: Buffer) {
  const { data, info } = await sharp(png).rotate().resize(SIDE, SIDE, { fit: "inside", kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [W, H] = [info.width, info.height];
  const n = W * H;
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, n - W + x);
  for (let y = 1; y < H - 1; y++) border.push(y * W, y * W + W - 1);
  const clear = border.filter((p) => data[p * 4 + 3] < 128).length > border.length / 2;
  let paper: [number, number, number] | null = null;
  if (!clear) {
    const bins = new Map<number, [number, number, number, number]>();
    for (const p of border) {
      const [r, g, b] = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const s = bins.get(key) ?? [0, 0, 0, 0];
      bins.set(key, [s[0] + 1, s[1] + r, s[2] + g, s[3] + b]);
    }
    const [c, r, g, b] = [...bins.values()].sort((x, y) => y[0] - x[0])[0];
    paper = [r / c, g / c, b / c];
  }
  const isBg = (p: number) => data[p * 4 + 3] < 128 || (paper !== null && (data[p * 4] - paper[0]) ** 2 + (data[p * 4 + 1] - paper[1]) ** 2 + (data[p * 4 + 2] - paper[2]) ** 2 < 48 ** 2);
  // Utsidan: bakgrund som går att nå från kanten.
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const reach = (p: number) => {
    outside[p] = 1;
    stack[top++] = p;
  };
  for (const p of border) if (isBg(p) && !outside[p]) reach(p);
  while (top) {
    const p = stack[--top];
    const [x, y] = [p % W, (p / W) | 0];
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (q >= 0 && !outside[q] && isBg(q)) reach(q);
  }
  // Märket utan utsidan, krympt två bildpunkter.
  const gray = Buffer.alloc(n, 255);
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const p = y * W + x;
      let inside = true;
      for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2 && inside; dx++) if (outside[p + dy * W + dx]) inside = false;
      if (inside) gray[p] = 0;
    }
  const mask = await sharp(gray, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 0 }).toBuffer();
  const color = !paper || paper.every((v) => v > 235) ? "#FFFFFF" : `#${paper.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const tag = await new Promise<string>((resolve, reject) => {
    const t = new Potrace({ turdSize: 50, alphaMax: 1, optCurve: true, optTolerance: 0.2, threshold: 128, blackOnWhite: true });
    t.loadImage(mask, (err) => (err ? reject(err) : resolve(t.getPathTag(color))));
  });
  const d = /\sd="([^"]+)"/.exec(tag)?.[1]?.trim();
  // Originalet utan utsidan, att jämföra vektorn med: en panel eller ruta som märket låg på hör inte till märket,
  // men bakgrundsfärgen inne i märket gör det.
  const cut = Buffer.from(data);
  for (let p = 0; p < n; p++) if (outside[p]) cut[p * 4 + 3] = 0;
  const cleaned = await sharp(cut, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return { path: d ? `<path d="${d}" fill="${color}" fill-rule="nonzero"/>` : "", cleaned };
}

let openai: OpenAI | null = null;
/** Bildmodellen jämför original och omritning: samma märke, samma färger, läsbar text, inga fläckar eller hål. */
async function reviewVector(original: Buffer, svg: string) {
  if (has("no-llm") || !process.env.OPENAI_API_KEY) return null;
  openai ??= new OpenAI();
  const png = async (img: Sharp) => `data:image/png;base64,${(await img.flatten({ background: "#FFFFFF" }).resize(512, 512, { fit: "contain", background: "#FFFFFF" }).png().toBuffer()).toString("base64")}`;
  const [a, b] = await Promise.all([png(sharp(original)), png(sharp(Buffer.from(svg), { density: 150 }))]);
  const res = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: 'Bild 1 är ett klubbmärke. Bild 2 är samma märke omritat som vektorer, för tryck på kläder. Är bild 2 en trogen och ren återgivning av bild 1 – samma former och färger, all text läsbar och rättstavad som i bild 1, inga förvrängda bokstäver, saknade delar, fläckar eller hål? Små skillnader i kantjämnhet gör inget. Svara som JSON: {"ok": true | false, "issue": "kort beskrivning på svenska om något är fel, annars tom"}' },
          { type: "input_image", detail: "low", image_url: a },
          { type: "input_image", detail: "low", image_url: b },
        ],
      },
    ],
    text: { format: { type: "json_object" } },
  });
  try {
    const v = JSON.parse(res.output_text);
    return { ok: Boolean(v.ok), issue: String(v.issue ?? "") };
  } catch {
    return null;
  }
}

async function vectorize(id: string): Promise<VectorRecord | typeof PENDING> {
  const recFile = path.join(HD, `${id}.json`);
  // Bara klubbar som agenten granskat: annars vet vi inte om registrets bild ens är klubbens märke.
  if (!existsSync(recFile)) return PENDING;
  const rec: HdRecord = JSON.parse(await readFile(recFile, "utf8"));
  if (rec.status === "kunde inte nås") return PENDING;
  const base = { id, name: rec.name ?? id, at: new Date().toISOString(), colors: null, mismatch: null, file: null };
  const no = (reason: string, extra: Partial<VectorRecord> = {}): VectorRecord => ({ ...base, ok: false, from: null, srcLong: null, reason, ...extra });
  if (rec.status.startsWith("fel bild")) return no("registrets bild är inte klubbens märke");
  if (rec.after?.vector) return no("märket finns redan som vektor");
  const src = await source(id, rec);
  if (!src) return no("ingen bild");
  // Tomma kanter bort först, så att storleken är märkets.
  const trimmed = await sharp(src.buf).ensureAlpha().trim({ threshold: 24 }).png().toBuffer().catch(() => src.buf);
  const m = await sharp(trimmed).metadata();
  const long = Math.max(m.width ?? 0, m.height ?? 0);
  const at = { from: src.from, srcLong: long };
  if (long < MIN_PX) return no(`för liten (${long} px) för att ritas om`, at);
  // Designimporten vill ha minst 300 bildpunkter; mindre märken skalas upp först (den ritar ändå om i 1600).
  const input = long < 600 ? await sharp(trimmed).resize(600, 600, { fit: "inside", kernel: "lanczos3" }).png().toBuffer() : trimmed;
  let svg: string;
  try {
    svg = (await convertDesign(input)).svg;
  } catch (e) {
    return no((e as Error).message, at);
  }
  const under = await underlay(input);
  svg = svg.replace(/(<svg[^>]*>)/, `$1${under.path}`);
  const colors = new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((x) => x[1].toUpperCase())).size;
  const miss = await mismatch(under.cleaned, svg);
  const file = `${id}.vektor.svg`;
  await writeFile(path.join(HD, file), svg);
  const result = { ...base, ...at, colors, mismatch: Math.round(miss * 1000) / 1000, file };
  if (miss > MAX_MISMATCH) return { ...result, ok: false, reason: `vektorn skiljer sig från originalet (${Math.round(miss * 100)} % av märket)` };
  const review = await reviewVector(under.cleaned, svg).catch(() => null);
  if (review && !review.ok) return { ...result, ok: false, review, reason: `granskningen: ${review.issue}`.slice(0, 160) };
  return { ...result, ok: true, review, reason: null };
}

async function runAll(spec: string) {
  const all = existsSync(spec) ? readFileSync(spec, "utf8").split(/\s+/).filter(Boolean) : spec.split(",");
  const [k, n] = (flag("del") ?? "1/1").split("/").map(Number);
  const mine = all.filter((_, i) => i % n === k - 1);
  const ids = has("force") ? mine : mine.filter((id) => !existsSync(path.join(HD, `${id}.vektor.json`)));
  const stats: Record<string, number> = {};
  for (const [i, id] of ids.entries()) {
    // Ett märke "pågår" innan klubben ritas om: kraschar bildbiblioteket på en trasig bild ligger märket kvar, och
    // klubben hoppas över när körningen startas om, i stället för att krascha igen.
    const marker = path.join(HD, `${id}.vektor.json`);
    const crashed: VectorRecord = { id, name: id, at: new Date().toISOString(), ok: false, from: null, srcLong: null, colors: null, mismatch: null, file: null, reason: "kraschade vid omritningen" };
    await writeFile(marker, JSON.stringify(crashed, null, 2));
    const r = await vectorize(id).catch((e) => ({ id, name: id, ok: false, reason: `fel: ${(e as Error).message}`.slice(0, 120) }) as VectorRecord);
    if (r === PENDING) {
      await rm(marker, { force: true });
      stats[PENDING] = (stats[PENDING] ?? 0) + 1;
      continue;
    }
    if (r.review) stats["granskade av modellen"] = (stats["granskade av modellen"] ?? 0) + 1;
    await writeFile(path.join(HD, `${id}.vektor.json`), JSON.stringify(r, null, 2));
    const key = r.ok ? "godkänd" : (r.reason ?? "").replace(/\(.*\)/, "").replace(/ \d+ px.*/, "").trim().slice(0, 50);
    stats[key] = (stats[key] ?? 0) + 1;
    log(`${String(i + 1).padStart(4)}/${ids.length} ${String(r.name).slice(0, 30).padEnd(30)} ${r.ok ? "godkänd" : "–"} ${r.srcLong ?? ""} px ${r.colors ?? ""} färger, avvikelse ${r.mismatch ?? "–"} ${r.ok ? "" : r.reason ?? ""}`);
  }
  log("klart:", JSON.stringify(stats));
}

/** Original och vektor bredvid varandra, 20 klubbar per bild, för att se med egna ögon. */
async function sheet(spec: string, dir: string) {
  const ids = readFileSync(spec, "utf8").split(/\s+/).filter(Boolean).filter((id) => existsSync(path.join(HD, `${id}.vektor.json`)));
  await mkdir(dir, { recursive: true });
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const box = (buf: Buffer, svg = false) => sharp(buf, svg ? { density: 200 } : {}).flatten({ background: "#FFFFFF" }).resize(170, 170, { fit: "contain", background: "#FFFFFF" }).png().toBuffer();
  const cell = { w: 560, h: 220 };
  for (let page = 0; page * 20 < ids.length; page++) {
    const rows = ids.slice(page * 20, page * 20 + 20);
    const comps: OverlayOptions[] = [];
    for (const [i, id] of rows.entries()) {
      const r: VectorRecord = JSON.parse(await readFile(path.join(HD, `${id}.vektor.json`), "utf8"));
      const x = (i % 4) * cell.w;
      const y = Math.floor(i / 4) * cell.h;
      const rec: HdRecord | null = existsSync(path.join(HD, `${id}.json`)) ? JSON.parse(await readFile(path.join(HD, `${id}.json`), "utf8")) : null;
      const src = await source(id, rec);
      if (src) comps.push({ input: await box(src.buf), left: x + 10, top: y + 30 });
      if (r.file) comps.push({ input: await box(await readFile(path.join(HD, r.file)), true), left: x + 195, top: y + 30 });
      const color = r.ok ? "#0A7A2F" : "#9A6700";
      comps.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cell.h}"><text x="10" y="20" font-family="Helvetica" font-size="15" font-weight="bold">${esc(r.name.slice(0, 50))}</text><text x="380" y="70" font-family="Helvetica" font-size="13">${r.from ?? ""} ${r.srcLong ?? ""} px</text><text x="380" y="92" font-family="Helvetica" font-size="13">${r.colors ?? "–"} färger</text><text x="380" y="114" font-family="Helvetica" font-size="13">avvikelse ${r.mismatch ?? "–"}</text><text x="380" y="140" font-family="Helvetica" font-size="13" font-weight="bold" fill="${color}">${r.ok ? "godkänd" : "ej godkänd"}</text></svg>`,
        ),
        left: x,
        top: y,
      });
    }
    await sharp({ create: { width: cell.w * 4, height: cell.h * Math.ceil(rows.length / 4), channels: 3, background: "#FFFFFF" } })
      .composite(comps)
      .png()
      .toFile(path.join(dir, `vektor-${page + 1}.png`));
  }
  log(`${Math.ceil(ids.length / 20)} bilder i ${dir}`);
}

/** Gruppen på klubbregistrets sida (lib/newwave/clubVector.ts), ur omritningens resultat. */
function vectorKind(r: VectorRecord | null, rec: HdRecord | null, registryVector: boolean): VectorKind {
  if (registryVector) return "egen";
  if (!r) return rec?.status === "kunde inte nås" ? "vantar" : "ovrigt";
  if (r.ok) return "godkand";
  const why = r.reason ?? "";
  if (why.startsWith("registrets bild")) return "felbild";
  if (why.startsWith("märket finns redan")) return "egen";
  if (why.startsWith("för liten")) return "liten";
  if (why.startsWith("vektorn skiljer")) return "avvek";
  if (why.startsWith("granskningen")) return "granskning";
  return "ritas";
}

/**
 * Skriver vektor.json (gruppen för varje klubb i registret) och en bild av varje godkänd vektor i vektorer/, som
 * klubbregistrets sida visar. `scrape-clubs.mjs publish` tar med båda, och de godkända SVG:erna, till produktionen.
 */
async function status() {
  const index: { items: { id: string }[] } = JSON.parse(await readFile(path.join(ROOT, "index.json"), "utf8"));
  const dir = path.join(ROOT, "vektorer");
  await mkdir(dir, { recursive: true });
  const items: Record<string, VectorStatus> = {};
  const thumbs: { id: string; svg: string }[] = [];
  for (const { id } of index.items) {
    const read = async <T>(f: string): Promise<T | null> => (existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null);
    const site = await read<{ logo?: { vector?: boolean } }>(path.join(ROOT, "sites", `${id}.json`));
    const r = await read<VectorRecord>(path.join(HD, `${id}.vektor.json`));
    const k = vectorKind(r, await read<HdRecord>(path.join(HD, `${id}.json`)), Boolean(site?.logo?.vector));
    items[id] = k === "godkand" && r ? { k, m: r.mismatch ?? undefined, n: r.colors ?? undefined, at: r.at } : { k };
    if (k === "godkand" && r?.file) thumbs.push({ id, svg: path.join(HD, r.file) });
  }
  let made = 0;
  const queue = [...thumbs];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const out = path.join(dir, `${t.id}.png`);
        if (existsSync(out) && statSync(out).mtimeMs >= statSync(t.svg).mtimeMs) continue;
        await sharp(await readFile(t.svg)).resize(480, 480, { fit: "inside" }).png({ palette: true, quality: 95, effort: 8 }).toFile(out);
        made++;
      }
    }),
  );
  await writeFile(path.join(ROOT, "vektor.json"), JSON.stringify({ builtAt: new Date().toISOString(), items }));
  const counts = Object.values(items).reduce<Record<string, number>>((m, s) => ({ ...m, [s.k]: (m[s.k] ?? 0) + 1 }), {});
  log(`vektor.json: ${index.items.length} klubbar ${JSON.stringify(counts)}, ${made} nya bilder i ${dir}`);
}

async function main() {
  // Nyckeln till bildmodellen, som när Next.js startar.
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const [cmd, a, b] = args.filter((x) => !x.startsWith("--"));
  if (cmd === "run") await runAll(a);
  else if (cmd === "sheet") await sheet(a, b);
  else if (cmd === "status") await status();
  else console.log("jiti scripts/club-logos-vector.ts run <idfil|id,id> [--del=1/4] [--force] | sheet <idfil> <utmapp> | status");
  process.exit(0);
}
main();
