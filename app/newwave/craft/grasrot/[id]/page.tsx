/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrasrotShop } from "@/components/newwave/grasrot/GrasrotShop";
import { grasrotClub } from "@/lib/newwave/grasrot/clubs";
import { clubInks } from "@/lib/newwave/grasrot/colors";
import { emblemSet, VARIANTS, type Variant } from "@/lib/newwave/grasrot/emblem";
import { type Artwork, type Check, FILE_SET, FONT_CHECK, fileHref, fileName, printChecks, VARIANT_TEXT } from "@/lib/newwave/grasrot/files";
import { heroImage } from "@/lib/newwave/grasrot/hero";
import { GRASROT_PRODUCTS } from "@/lib/newwave/grasrot/products";
import { shopProducts } from "@/lib/newwave/grasrot/shop";
import { SOCIAL_FORMATS, SOCIAL_SLIDES, type SocialFormat } from "@/lib/newwave/grasrot/social";
import type { ColorMode } from "@/lib/newwave/vector/write";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const metadata: Metadata = { title: "Gräsrot 360 · Förening" };

const LABEL: Record<Variant, string> = { original: "Original", solid: "Solid", negativ: "Negativ" };
const MODE: Record<ColorMode, string> = { spot: "Pantone", cmyk: "CMYK", rgb: "RGB" };
const DOT: Record<Check["level"], string> = { ok: "bg-[#2E9E5B]", varning: "bg-[#E0A100]", stopp: "bg-[#D92D20]" };
const link = "nw-hit font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 hover:decoration-[var(--nw-ink)]";

function Tile({ id, name, artwork, variant, checks }: { id: string; name: string; artwork: Artwork; variant: Variant; checks: Check[] }) {
  const dl = (format: "pdf" | "eps" | "svg" | "png", mode?: ColorMode) => {
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
        className={`relative block aspect-[4/3] overflow-hidden rounded-xl ${variant === "negativ" ? "bg-[var(--club)]" : "bg-[var(--nw-soft)]"}`}
      >
        <img src={fileHref(id, fileName(artwork, variant, "svg"))} alt={`${name} ${artwork === "ordmarke" ? "ordmärke" : "klubbmärke"}, ${LABEL[variant].toLowerCase()}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-4" />
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
            <td className="py-1.5 text-right">{dl("svg")}</td>
            <td className="py-1.5 text-right">{dl("png")}</td>
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
  const [hero, shop] = await Promise.all([heroImage(id), shopProducts(id)]);
  if (!shop) notFound();
  const { products, featured } = shop;
  const base = `/api/v1/newwave/grasrot/${id}`;

  return (
    <div className="nw-page">
      <Link href="/newwave/craft/grasrot" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
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
          <p className="nw-club-heading text-[17px]">Hela leveransen i ett paket</p>
          <p className="mt-1 text-[13.5px] text-white/70">
            Klubbmärke och ordmärke ({FILE_SET.length} filer i Pantone, CMYK och RGB), kulörer som färgprover, webbshopens produktbilder i alla färger, herobilden, inlägg för sociala medier och produktionsunderlag per
            leverantör – med en läs mig-fil. Första gången tar det en halv minut att bygga.
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

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Webbshop – produkterna i Bilaga 2</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">
          Ensamstående klubbmärke eller ordmärke på varje produkt, i leverantörens färger. Varianten följer plaggfärgen: original på ljust, vitt på mörkt, gravyr på lackade flaskor. Vrid produkten i 3D eller se fotot.
        </p>
        <GrasrotShop id={id} products={products} featured={featured} />
      </section>

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Herobild</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">
          Produkterna på klubbstugans veranda under sommarfesten, i de färger ur sortimentet som ligger närmast föreningens
          {hero ? `: ${GRASROT_PRODUCTS.filter((p) => p.id !== "halsduk" && hero.info.colors[p.id]).map((p) => `${p.short.toLowerCase()} i ${hero.info.colors[p.id].name}`).join(", ")}` : ""}. Fotot är taget av bildmodellen med webbshopens produktbilder som förlaga; tryckfilerna och produktbilderna är exakta.
        </p>
        <a href={`${base}/herobild.jpg`} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-[var(--nw-radius)] ring-1 ring-[var(--nw-line)]">
          <img src={`${base}/herobild.jpg`} alt={`${club.name}s produkter på klubbstugans veranda`} className="aspect-video w-full object-cover" />
        </a>
        <a href={`${base}/herobild.jpg?dl=1`} className={`${link} mt-2 inline-block text-[13px]`}>
          Ladda ner herobilden (1920 × 1080)
        </a>
      </section>

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Sociala medier</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">Herobilden följd av varje produkt, för flödet och för stories.</p>
        {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
          <div key={f} className="mt-4">
            <p className="text-[12.5px] font-medium text-[var(--nw-muted)]">
              {SOCIAL_FORMATS[f].label} · {SOCIAL_FORMATS[f].w} × {SOCIAL_FORMATS[f].h}
            </p>
            <ul className={`mt-2 grid gap-2 ${f === "feed" ? "grid-cols-3 md:grid-cols-6" : "grid-cols-3 sm:grid-cols-6"}`}>
              {SOCIAL_SLIDES.map((name) => (
                <li key={name} className="min-w-0">
                  <a href={`${base}/social-${f}-${name}.jpg?dl=1`} className="block overflow-hidden rounded-lg ring-1 ring-[var(--nw-line)]" aria-label={`Ladda ner ${name} (${SOCIAL_FORMATS[f].label})`}>
                    <img src={`${base}/social-${f}-${name}.jpg`} alt="" loading="lazy" className={`w-full object-cover ${f === "feed" ? "aspect-[4/5]" : "aspect-[9/16]"}`} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-10">
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Produktionsunderlag</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">
          Per produkt ett produktionsblad och filerna i det format metoden kräver, i exakt storlek: vektor med Pantone för screentryck, brodyr och gravyr, PNG i 300 dpi för transfer och digitaltryck.
        </p>
        <ul className="mt-4 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)] text-[13.5px]">
          {products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <span className="min-w-0 flex-1 font-medium text-[var(--nw-ink)]">
                {p.short} <span className="font-normal text-[var(--nw-muted)]">· {p.supplier} · {p.files.length} filer</span>
              </span>
              <a href={`${base}/produktionsblad-${p.id}.pdf?dl=1`} className={link}>
                Produktionsblad
              </a>
            </li>
          ))}
        </ul>
        <a href={`${base}/produktionsorder.csv?dl=1`} className={`${link} mt-2 inline-block text-[13px]`}>
          Produktionsorder för alla produkter (CSV)
        </a>
      </section>
    </div>
  );
}
