import { deflateSync } from "node:zlib";
import type { Cmyk } from "@/lib/pantone";
import type { Seg } from "./path";
import type { Flat } from "./svg";

/**
 * Vektorfilerna tryckerierna vill ha: PDF och EPS i exakt storlek, med varje färg som en namngiven dekorfärg
 * ("PANTONE 2738 C", med CMYK som ersättning för skärm och digitaltryck), som process-CMYK eller som RGB.
 */

/** En tryckfärg: namnet RIP:en separerar på och CMYK i 0–100. */
export type Ink = { name: string; cmyk: Cmyk };
export type ColorMode = "spot" | "cmyk" | "rgb";
export type VectorDoc = { flat: Flat; widthMm: number; title: string; mode: ColorMode; inks: Record<string, Ink> };

const PT_PER_MM = 72 / 25.4;
const n3 = (v: number) => String(Number(v.toFixed(3)));
const unit = (v: number) => n3(v / 100);

export function pageSize(doc: Pick<VectorDoc, "flat" | "widthMm">) {
  const w = doc.widthMm * PT_PER_MM;
  return { w, h: (w * doc.flat.box.h) / doc.flat.box.w, s: w / doc.flat.box.w };
}

/** Färgerna som filen använder, i ritordning; dekor- och CMYK-filer kräver en tryckfärg för varje. */
function inksOf(doc: VectorDoc) {
  const fills = [...new Set(doc.flat.shapes.map((s) => s.fill))];
  if (doc.mode !== "rgb") {
    const missing = fills.filter((f) => !doc.inks[f]);
    if (missing.length) throw new Error(`Tryckfärg saknas för ${missing.join(", ")}`);
  }
  return fills;
}

const rgb01 = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function pathOps(segs: Seg[], move: string, line: string, curve: string, close: string) {
  return segs
    .map((s) => {
      if (s[0] === "Z") return close;
      if (s[0] === "M") return `${n3(s[1])} ${n3(s[2])} ${move}`;
      if (s[0] === "L") return `${n3(s[1])} ${n3(s[2])} ${line}`;
      return `${s.slice(1).map((v) => n3(v as number)).join(" ")} ${curve}`;
    })
    .join("\n");
}

/* ---------- PDF ---------- */

const pdfName = (s: string) => `/${[...s].map((c) => (/[A-Za-z0-9._-]/.test(c) ? c : `#${c.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`)).join("")}`;
/** ASCII som vanlig sträng, annars UTF-16 med BOM – så att Särö står som Särö i dokumentinfon. */
const pdfText = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})` : `<FEFF${[...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("")}>`;

export function toPdf(doc: VectorDoc): Buffer {
  const fills = inksOf(doc);
  const { w, h, s } = pageSize(doc);
  const { x, y } = doc.flat.box;
  const spaces = doc.mode === "spot" ? fills.map((f, i) => ({ fill: f, key: `CS${i}` })) : [];
  const setColor = (fill: string) => {
    if (doc.mode === "spot") return `/${spaces.find((c) => c.fill === fill)!.key} cs 1 scn`;
    if (doc.mode === "cmyk") return `${doc.inks[fill].cmyk.map(unit).join(" ")} k`;
    return `${rgb01(fill).map(n3).join(" ")} rg`;
  };
  const body: string[] = [`q ${n3(s)} 0 0 ${n3(-s)} ${n3(-x * s)} ${n3(h + y * s)} cm`];
  let current = "";
  for (const sh of doc.flat.shapes) {
    if (sh.fill !== current) body.push(setColor((current = sh.fill)));
    body.push(pathOps(sh.segs, "m", "l", "c", "h"), sh.rule === "evenodd" ? "f*" : "f");
  }
  body.push("Q");
  const stream = deflateSync(Buffer.from(body.join("\n"), "latin1"));

  const objects: (string | Buffer)[] = [];
  const add = (o: string | Buffer) => objects.push(o) as number;
  const catalog = add("");
  const pages = add("");
  const page = add("");
  const contents = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, Buffer.from("\nendstream")]));
  const info = add(`<< /Title ${pdfText(doc.title)} /Creator (Next Wave) /Producer (Next Wave tryckfiler) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`);
  const spaceRefs = spaces.map((c) => {
    const ink = doc.inks[c.fill];
    const fn = `<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${ink.cmyk.map(unit).join(" ")}] /N 1 >>`;
    return `/${c.key} ${add(`[/Separation ${pdfName(ink.name)} /DeviceCMYK ${fn}]`)} 0 R`;
  });
  const box = `[0 0 ${n3(w)} ${n3(h)}]`;
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`;
  objects[page - 1] = `<< /Type /Page /Parent ${pages} 0 R /MediaBox ${box} /TrimBox ${box} /ArtBox ${box} /Resources << ${spaceRefs.length ? `/ColorSpace << ${spaceRefs.join(" ")} >>` : ""} >> /Contents ${contents} 0 R >>`;

  const chunks: Buffer[] = [Buffer.from("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let offset = chunks[0].length;
  const xref: number[] = [];
  objects.forEach((o, i) => {
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n")]);
    xref.push(offset);
    offset += b.length;
    chunks.push(b);
  });
  const table = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...xref.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${table}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

/* ---------- EPS ---------- */

const psText = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?")})`;

export function toEps(doc: VectorDoc): Buffer {
  const fills = inksOf(doc);
  const { w, h, s } = pageSize(doc);
  const { x, y } = doc.flat.box;
  const spot = doc.mode === "spot";
  const names = fills.map((f) => doc.inks[f]?.name);
  const head = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`,
    `%%HiResBoundingBox: 0 0 ${n3(w)} ${n3(h)}`,
    `%%Title: ${psText(doc.title)}`,
    "%%Creator: Next Wave",
    `%%CreationDate: ${new Date().toISOString()}`,
    "%%LanguageLevel: 2",
    ...(spot ? [`%%DocumentCustomColors: ${names.map(psText).join(" ")}`, ...fills.map((f) => `%%CMYKCustomColor: ${doc.inks[f].cmyk.map(unit).join(" ")} ${psText(doc.inks[f].name)}`)] : []),
    ...(doc.mode === "cmyk" ? ["%%DocumentProcessColors: Cyan Magenta Yellow Black"] : []),
    "%%EndComments",
    "%%BeginProlog",
    "/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def /h {closepath} bind def",
    "%%EndProlog",
    "%%BeginSetup",
    "%%EndSetup",
    "save",
    `[${n3(s)} 0 0 ${n3(-s)} ${n3(-x * s)} ${n3(h + y * s)}] concat`,
  ];
  const setColor = (fill: string) => {
    if (spot) {
      const [C, M, Y, K] = doc.inks[fill].cmyk.map(unit);
      return `[/Separation ${psText(doc.inks[fill].name)} /DeviceCMYK {dup ${C} mul exch dup ${M} mul exch dup ${Y} mul exch ${K} mul}] setcolorspace 1 setcolor`;
    }
    if (doc.mode === "cmyk") return `${doc.inks[fill].cmyk.map(unit).join(" ")} setcmykcolor`;
    return `${rgb01(fill).map(n3).join(" ")} setrgbcolor`;
  };
  const body: string[] = [];
  let current = "";
  for (const sh of doc.flat.shapes) {
    if (sh.fill !== current) body.push(setColor((current = sh.fill)));
    body.push("newpath", pathOps(sh.segs, "m", "l", "c", "h"), sh.rule === "evenodd" ? "eofill" : "fill");
  }
  return Buffer.from([...head, ...body, "restore", "showpage", "%%Trailer", "%%EOF", ""].join("\n"), "latin1");
}
