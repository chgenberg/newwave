/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { grasrotClub } from "@/lib/newwave/grasrot/clubs";
import { clubInks } from "@/lib/newwave/grasrot/colors";
import { emblemSet, VARIANTS, type Variant } from "@/lib/newwave/grasrot/emblem";
import { type Artwork, type Check, FILE_SET, FONT_CHECK, fileHref, fileName, printChecks, VARIANT_TEXT } from "@/lib/newwave/grasrot/files";
import type { ColorMode } from "@/lib/newwave/vector/write";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Gräsrot 360 · Tryckfiler" };

const LABEL: Record<Variant, string> = { original: "Original", solid: "Solid", negativ: "Negativ" };
const MODE: Record<ColorMode, string> = { spot: "Pantone", cmyk: "CMYK", rgb: "RGB" };
const DOT: Record<Check["level"], string> = { ok: "bg-[#2E9E5B]", varning: "bg-[#E0A100]", stopp: "bg-[#D92D20]" };
const link = "nw-hit font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 hover:decoration-[var(--nw-ink)]";

function Tile({ id, name, artwork, variant, checks }: { id: string; name: string; artwork: Artwork; variant: Variant; checks: Check[] }) {
  const dl = (format: "pdf" | "eps" | "svg", mode?: ColorMode) => {
    const file = fileName(artwork, variant, format, mode);
    return (
      <a href={`${fileHref(id, file)}?dl=1`} download={`${id}-${file}`} className={link}>
        {format.toUpperCase()}
      </a>
    );
  };
  return (
    <li className="flex min-w-0 flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-3">
      <a
        href={fileHref(id, fileName(artwork, variant, "svg"))}
        target="_blank"
        rel="noreferrer"
        className={`grid aspect-[4/3] place-items-center rounded-xl p-4 ${variant === "negativ" ? "bg-[var(--club)]" : "bg-[var(--nw-soft)]"}`}
      >
        <img src={fileHref(id, fileName(artwork, variant, "svg"))} alt={`${name} ${artwork === "ordmarke" ? "ordmärke" : "klubbmärke"}, ${LABEL[variant].toLowerCase()}`} loading="lazy" className="max-h-full max-w-full object-contain" />
      </a>
      <p className="mt-3 text-[14px] font-semibold text-[var(--nw-ink)]">{LABEL[variant]}</p>
      <p className="text-[12.5px] text-[var(--nw-muted)]">{VARIANT_TEXT[variant].split(" – ")[1]}</p>

      <table className="mt-3 w-full text-[12.5px]">
        <tbody>
          {(["spot", "cmyk", "rgb"] as const).map((mode) => (
            <tr key={mode} className="border-t border-[var(--nw-line)]">
              <th scope="row" className="py-1.5 text-left font-normal text-[var(--nw-muted)]">
                {MODE[mode]}
              </th>
              {variant === "negativ" && mode === "cmyk" ? (
                <td colSpan={2} className="py-1.5 text-right text-[var(--nw-faint)]">
                  Vitt trycks inte i CMYK
                </td>
              ) : (
                <>
                  <td className="py-1.5 text-right">{dl("pdf", mode)}</td>
                  <td className="py-1.5 text-right">{dl("eps", mode)}</td>
                </>
              )}
            </tr>
          ))}
          <tr className="border-t border-[var(--nw-line)]">
            <th scope="row" className="py-1.5 text-left font-normal text-[var(--nw-muted)]">
              Skärm
            </th>
            <td colSpan={2} className="py-1.5 text-right">
              {dl("svg")}
            </td>
          </tr>
        </tbody>
      </table>

      <ul className="mt-2 flex flex-col gap-1.5 border-t border-[var(--nw-line)] pt-2.5">
        {checks.map((c) => (
          <li key={c.text} className="flex gap-2 text-[12.5px] leading-snug text-[var(--nw-ink)]">
            <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${DOT[c.level]}`} aria-label={c.level} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{c.text}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default async function GrasrotClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = grasrotClub(id);
  const pending = emblemSet(id);
  if (!club || !pending) notFound();
  const [set, inks] = await Promise.all([pending, clubInks(id)]);
  const artworks: { artwork: Artwork; title: string; text: string }[] = [
    { artwork: "klubbmarke", title: "Klubbmärke", text: "Märket i tre varianter. Solid och negativ är en färg – svart på ljusa plagg, vitt på mörka." },
    { artwork: "ordmarke", title: "Ordmärke", text: `Gräsrot 360-ordmärket med ${club.words ? `${club.words.caps} och ${club.words.script}` : "föreningens namn"}, rutbandet i föreningens färger och märket i en färg. ${FONT_CHECK.text}` },
  ];
  const checks = Object.fromEntries(
    await Promise.all(artworks.flatMap(({ artwork }) => VARIANTS.map(async (v) => [`${artwork}-${v}`, ((await printChecks(id, artwork, v)) ?? []).filter((c) => c.text !== set.quality.note && c.text !== FONT_CHECK.text)] as const))),
  );
  const quality: Check["level"] = set.quality.ready ? (set.quality.kind === "vektor" ? "ok" : "varning") : "stopp";

  return (
    <div className="nw-page">
      <Link href="/newwave/new-wave/grasrot" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        ← Gräsrot 360
      </Link>
      <p className="mt-4 text-[12.5px] text-[var(--nw-muted)]">
        {club.city} · {club.sport}
      </p>
      <h1 className="nw-club-heading mt-1 text-[28px] leading-tight text-[var(--club)] sm:text-[32px]">{club.name}</h1>
      <p className="mt-2 flex gap-2 text-[14px] text-[var(--nw-ink)]">
        <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[quality]}`} aria-hidden />
        <span>
          {set.quality.note}. <span className="text-[var(--nw-muted)]">Källa: {club.source.from}{club.source.note ? ` – ${club.source.note}` : ""}.</span>
        </span>
      </p>

      <div className="mt-6 flex flex-col gap-3 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="nw-club-heading text-[17px]">Alla tryckfiler i ett paket</p>
          <p className="mt-1 text-[13.5px] text-white/70">
            {FILE_SET.length} filer i mapparna pantone, cmyk och rgb, 100 mm breda och helt i vektor, med en läs mig-fil om kulörer och förhandskontroll.
          </p>
        </div>
        <a href={fileHref(id, "paket.zip")} download={`${id}-grasrot-360.zip`} className="nw-btn nw-club-btn shrink-0">
          Ladda ner (zip)
        </a>
      </div>

      {artworks.map(({ artwork, title, text }) => (
        <section key={artwork} className="mt-10">
          <h2 className="nw-club-heading text-[19px] text-[var(--club)]">{title}</h2>
          <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">{text}</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {VARIANTS.map((v) => (
              <Tile key={v} id={id} name={club.name} artwork={artwork} variant={v} checks={checks[`${artwork}-${v}`]} />
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Kulörer</h2>
        <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Färgerna i märket som tryckeriet behöver dem. Förslag bekräftas av föreningen innan serieproduktion.</p>
        <ul className="mt-4 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
          {inks.map((i) => (
            <li key={i.hex} className="flex items-start gap-3 py-3">
              <span className="h-9 w-9 shrink-0 rounded-lg border border-[var(--nw-line)]" style={{ background: i.hex }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--nw-ink)]">
                  {i.pantone} <span className="nw-mono text-[12px] font-normal text-[var(--nw-muted)]">· {i.hex} · CMYK {i.cmyk.join("/")}</span>
                </p>
                {i.note ? <p className="mt-0.5 text-[12.5px] text-[#8A5A00]">{i.note}</p> : null}
              </div>
              <span className="shrink-0 rounded-full bg-[var(--nw-soft)] px-2.5 py-0.5 text-[12px] text-[var(--nw-ink)]">{i.source === "profil" ? "Föreningens profil" : "Förslag"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
