import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FilmChannel } from "./scarfChannels";
import { FILM, closeUp, endCard, introCard, photoCard, scrollStage, strip, type MediaInput } from "./scarfMedia";

/**
 * Filmerna för Reels och TikTok: stillbilder och långa bilder av halsduken som kameran åker över, klippta ihop av
 * ffmpeg till en mp4 på tio sekunder. Ingen bildmodell – samma halsduk ger samma film.
 *
 * ffmpeg finns i Dockerfilen. Saknas programmet (lokalt utan ffmpeg) blir det ingen film, och sidan säger det.
 */

const BIN = process.env.FFMPEG_PATH || "ffmpeg";
const FPS = 30;
const CUT = 0.35;
const { w: W, h: H } = FILM;

let found: Promise<boolean> | null = null;
export const hasFfmpeg = () => (found ??= new Promise<boolean>((resolve) => execFile(BIN, ["-version"], { timeout: 8000 }, (err) => resolve(!err))));

const run = (args: string[]) =>
  new Promise<void>((resolve, reject) =>
    execFile(BIN, args, { timeout: 150_000, maxBuffer: 8_000_000 }, (err, _out, stderr) => (err ? reject(new Error(`ffmpeg: ${String(stderr).split("\n").filter(Boolean).slice(-3).join(" | ") || err.message}`)) : resolve())),
  );

/**
 * ffmpeg startar annars en tråd per kärna för varje bild, filter och kodare – över tvåhundra trådar per film. Två filmer
 * samtidigt slog i serverns gräns, och den andra filmens kodare gick inte att starta. Därför få trådar, och en film i taget.
 */
const THREADS = { decode: "1", filter: "2", encode: "2" };

let busy = 0;
const waiting: (() => void)[] = [];
async function turn<T>(job: () => Promise<T>): Promise<T> {
  if (busy >= 1) await new Promise<void>((go) => waiting.push(go));
  busy++;
  try {
    return await job();
  } finally {
    busy--;
    waiting.shift()?.();
  }
}

type Transition = "fade" | "slideup" | "slideleft" | "smoothup" | "circleopen";
type Scene = { dur: number; into?: Transition; over?: Buffer; overAt?: number } & (
  | { kind: "zoom"; bg: Buffer; from: number; to: number }
  /** En lång stående bild som kameran åker längs med, uppifrån och ner eller tvärtom. */
  | { kind: "pan"; strip: Buffer; up?: boolean }
  /** En bred liggande bild som kameran åker över i sidled, mellan två lägen (0–1). */
  | { kind: "slide"; wide: Buffer; from: number; to: number }
  /** Två stående halsdukar som rullar åt var sitt håll. */
  | { kind: "duo"; bg: Buffer; left: Buffer; right: Buffer; x: [number, number] }
);

const ext = (buf: Buffer) => (buf[0] === 0x89 ? "png" : "jpg");

async function cutFilm(scenes: Scene[], posterAt: number) {
  const dir = path.join(os.tmpdir(), `nw-film-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    const inputs: string[] = [];
    let count = 0;
    const add = async (buf: Buffer) => {
      const file = path.join(dir, `i${count}.${ext(buf)}`);
      await writeFile(file, buf);
      inputs.push("-threads", THREADS.decode, "-framerate", String(FPS), "-i", file);
      return count++;
    };
    const graph: string[] = [];
    // En bild blir en ström: bilden läses en gång och upprepas i minnet under scenens längd.
    const hold = (i: number, dur: number) => `[${i}:v]loop=loop=-1:size=1:start=0,trim=duration=${dur},setpts=N/(${FPS}*TB)`;
    const ease = (dur: number) => `((1-cos(PI*min(1\\,t/${dur})))/2)`;
    const end = `fps=${FPS},setsar=1,format=yuv420p,settb=AVTB`;

    for (const [k, s] of scenes.entries()) {
      const out = s.over ? `b${k}` : `v${k}`;
      if (s.kind === "zoom") {
        const i = await add(s.bg);
        const frames = Math.round(s.dur * FPS);
        graph.push(`${hold(i, s.dur)},zoompan=z='${s.from}+(${s.to - s.from})*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},${end}[${out}]`);
      } else if (s.kind === "pan") {
        const i = await add(s.strip);
        const e = ease(s.dur);
        graph.push(`${hold(i, s.dur)},crop=${W}:${H}:0:'(ih-${H})*${s.up ? `(1-${e})` : e}',${end}[${out}]`);
      } else if (s.kind === "slide") {
        const i = await add(s.wide);
        graph.push(`${hold(i, s.dur)},crop=${W}:${H}:'(iw-${W})*(${s.from}+(${s.to - s.from})*${ease(s.dur)})':0,${end}[${out}]`);
      } else {
        const [b, l, r] = [await add(s.bg), await add(s.left), await add(s.right)];
        const e = ease(s.dur);
        graph.push(`${hold(b, s.dur)},format=yuv420p[g${k}]`, `${hold(l, s.dur)},format=rgba[l${k}]`, `${hold(r, s.dur)},format=rgba[r${k}]`);
        graph.push(`[g${k}][l${k}]overlay=x=${s.x[0]}:y='-(h-${H})*${e}'[m${k}]`, `[m${k}][r${k}]overlay=x=${s.x[1]}:y='-(h-${H})*(1-${e})',${end}[${out}]`);
      }
      if (s.over) {
        // Textlagret tonas in och glider upp på plats.
        const o = await add(s.over);
        const at = s.overAt ?? 0.2;
        graph.push(`${hold(o, s.dur)},format=rgba,fade=t=in:st=${at}:d=0.45:alpha=1[o${k}]`, `[b${k}][o${k}]overlay=x=0:y='26*(1-min(1\\,max(0\\,(t-${at})/0.45)))',${end}[v${k}]`);
      }
    }

    let last = "v0";
    let at = 0;
    for (let k = 1; k < scenes.length; k++) {
      at += scenes[k - 1].dur - CUT;
      graph.push(`[${last}][v${k}]xfade=transition=${scenes[k].into ?? "fade"}:duration=${CUT}:offset=${at.toFixed(3)}[x${k}]`);
      last = `x${k}`;
    }
    // Stillbilderna är JPG med fullt färgomfång; filmen ska ha det omfång som tv och appar väntar sig.
    graph.push(`[${last}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[ut]`);
    const total = scenes.reduce((sum, s) => sum + s.dur, 0) - CUT * (scenes.length - 1);
    const mp4 = path.join(dir, "film.mp4");
    const poster = path.join(dir, "omslag.jpg");
    const args = ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex_threads", THREADS.filter, "-filter_threads", THREADS.filter, "-filter_complex", graph.join(";"), "-map", "[ut]", "-t", total.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-threads", THREADS.encode, "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-an", mp4];
    // Ett tillfälligt fel (servern har ont om trådar eller minne just då) ska inte kosta filmen: ett försök till efter en kort paus.
    await run(args).catch(async (err) => {
      console.error("scarfFilm försöker igen efter", err instanceof Error ? err.message : err);
      await new Promise((go) => setTimeout(go, 1500));
      await run(args);
    });
    await run(["-y", "-hide_banner", "-loglevel", "error", "-threads", THREADS.decode, "-ss", Math.min(posterAt, total - 0.2).toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", poster]);
    return { mp4: await readFile(mp4), poster: await readFile(poster), seconds: total };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

/** Reels: märket och kroken, en åkning längs halsduken, fotot med rubriken och en slutbild. */
async function reels(m: MediaInput) {
  const { copy, look } = m;
  const [intro, front, end] = await Promise.all([introCard(m, copy.reels.hook), strip(m.front, 800, { width: W, color: look.stage }), endCard(m, { head: copy.headline, sub: copy.subline, cta: "Länk i bio" })]);
  const scenes: Scene[] = [
    { kind: "zoom", dur: 2, bg: intro.bg, over: intro.over, overAt: 0.15, from: 1, to: 1.07 },
    { kind: "pan", dur: 3.2, strip: front, into: "fade" },
  ];
  if (m.photos[0]) {
    const photo = await photoCard(m, m.photos[0], { head: copy.headline, sub: copy.subline });
    scenes.push({ kind: "zoom", dur: 2.8, bg: photo.bg, over: photo.over, overAt: 0.4, from: 1, to: 1.08, into: "slideup" });
  } else scenes.push({ kind: "pan", dur: 2.8, strip: await strip(m.back, 800, { width: W, color: look.stage }), up: true, into: "slideup" });
  scenes.push({ kind: "zoom", dur: 2.6, bg: end.bg, over: end.over, overAt: 0.3, from: 1.05, to: 1, into: "fade" });
  return cutFilm(scenes, m.photos[0] ? 6.6 : 1.4);
}

/** TikTok: kroken direkt på fotot, fram- och baksida som rullar åt var sitt håll, en närbild i sidled och en slutbild. */
async function tiktok(m: MediaInput) {
  const { copy, look } = m;
  const photo = m.photos[1] ?? m.photos[0];
  const [first, stage, left, right, wide, end] = await Promise.all([
    photo ? photoCard(m, photo, { head: copy.tiktok.hook, top: true }) : introCard(m, copy.tiktok.hook),
    scrollStage(m, ["Framsida", "Baksida"]),
    strip(m.front, 440),
    strip(m.back, 440),
    closeUp(m.front, H, look.stage),
    endCard(m, { head: copy.headline, sub: copy.subline, cta: "Länk i bio" }),
  ]);
  const scenes: Scene[] = [
    { kind: "zoom", dur: 2.3, bg: first.bg, over: first.over, overAt: 0.05, from: 1, to: 1.07 },
    { kind: "duo", dur: 3.2, bg: stage.bg, left, right, x: [W / 4 - 220, (W * 3) / 4 - 220], over: stage.over, overAt: 0.3, into: "slideleft" },
    { kind: "slide", dur: 2.6, wide, from: 0.22, to: 0.78, into: "fade" },
    { kind: "zoom", dur: 2.6, bg: end.bg, over: end.over, overAt: 0.3, from: 1.05, to: 1, into: "fade" },
  ];
  return cutFilm(scenes, 1.2);
}

const CUTS: Record<FilmChannel, (m: MediaInput) => Promise<{ mp4: Buffer; poster: Buffer; seconds: number }>> = { reels, tiktok };

/** Filmen för en kanal, eller null om ffmpeg saknas. */
export async function renderFilm(channel: FilmChannel, m: MediaInput) {
  if (!(await hasFfmpeg())) return null;
  return turn(() => CUTS[channel](m));
}
