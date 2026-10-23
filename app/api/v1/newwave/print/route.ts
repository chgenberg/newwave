import JSZip from "jszip";
import { readAsset } from "@/lib/newwave/asset";
import { nwProduct } from "@/lib/newwave/catalog";
import { fitDesign, sanitizeColor, sanitizeDesign } from "@/lib/newwave/marking";
import { fileSlug, isDarkHex, makeJob } from "@/lib/newwave/printFiles";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";

export const maxDuration = 120;

const HEX = /^#[0-9A-F]{6}$/i;
const url = (v: unknown) => (typeof v === "string" && v.length <= 300 ? v : undefined);

/**
 * Tryckfilerna för en position i en design från studion, med samma motor som hubben levererar godkända kampanjer med.
 * Body: produkt, plaggfärg, design, position (0 = huvudtrycket), varumärkets namn, färger och logga, och klubben när designen är ett wordmark.
 * Namnen per plagg följer med huvudtrycket.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const p = nwProduct(String(body?.product ?? ""));
  const sent = body?.design && typeof body.design === "object" ? (body.design as Record<string, unknown>) : undefined;
  const extra = Array.isArray(sent?.extra) ? sent.extra.slice(0, 3) : [];
  const position = Number(body?.position ?? 0);
  // Positionen väljs i designen som webbläsaren visar, innan servern rensar den.
  const spot = position === 0 ? sent : Number.isInteger(position) ? extra[position - 1] : undefined;
  if (!spot || typeof spot !== "object") return Response.json({ error: "Positionen finns inte." }, { status: 400 });
  const raw = p && sanitizeDesign(p, { ...sent, ...spot, extra: undefined, names: position === 0 ? sent?.names : undefined });
  if (!p || !raw) return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  const placement = fitDesign(p, raw);
  const color = sanitizeColor(p, body?.color);
  const dark = isDarkHex(color);

  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Next Wave";
  const palette = (Array.isArray(body?.palette) ? body.palette : []).filter((h): h is string => typeof h === "string" && HEX.test(h)).slice(0, 8);
  const club = typeof body?.club === "string" && /^[a-z0-9-]{1,80}$/.test(body.club) ? body.club : undefined;
  const art = body?.art as { logo?: unknown; logoDark?: unknown } | undefined;
  const artUrl =
    placement.wordmark && club
      ? wordmarkUrl(placement.wordmark, club, dark ? "dark" : "light", 3543, "png", placement.sizeCm)
      : (dark && url(placement.logo ? placement.logoDark : art?.logoDark)) || url(placement.logo ?? art?.logo);
  const data = artUrl ? await readAsset(artUrl) : null;
  if (!data) return Response.json({ error: "Motivet gick inte att läsa." }, { status: 404 });

  const slug = `${fileSlug(p.name)}${extra.length ? `-tryck${position + 1}` : ""}`;
  const job = await makeJob({ club: name, palette: palette.length ? palette : ["#111111", "#FFFFFF"], product: p, color, placement, names: placement.names, art: data, slug });
  const spec = [
    `${name} – ${p.name.toLowerCase()}, tryck ${position + 1}`,
    "",
    `Placering: ${job.placement}`,
    `Metod: ${job.methodLabel}`,
    `Mottagare: ${job.receiver}`,
    ...job.facts.map((f) => `${f.label}: ${f.value}`),
    "",
    ...(job.inks.length ? ["Färger:", ...job.inks.map((i) => `  ${i.name.padEnd(10)} ${i.hex}  ${i.pantone}${i.detail ? `  (${i.detail})` : ""}`), ""] : []),
    ...job.notes,
  ].join("\n");
  const zip = new JSZip();
  for (const f of job.files) zip.file(f.name, f.data);
  zip.file("specifikation.txt", spec);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(new Uint8Array(out), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${slug}.zip"`, "Content-Length": String(out.length), "Cache-Control": "private, no-store" },
  });
}
