/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GrasrotShop } from "@/components/newwave/grasrot/GrasrotShop";
import { CopyButton, PackageDownload } from "@/components/newwave/grasrot/PackageDownload";
import { GRASROT_CLUBS, grasrotClub, inkSource } from "@/lib/newwave/grasrot/clubs";
import { clubInks } from "@/lib/newwave/grasrot/colors";
import { emblemSet, VARIANTS, type Variant } from "@/lib/newwave/grasrot/emblem";
import { type Artwork, type Check, FILE_SET, FONT_CHECK, fileHref, fileName, printChecks, VARIANT_TEXT } from "@/lib/newwave/grasrot/files";
import { heroImage } from "@/lib/newwave/grasrot/hero";
import { GRASROT_PRODUCTS } from "@/lib/newwave/grasrot/products";
import { shopProducts } from "@/lib/newwave/grasrot/shop";
import { captions, colorSv, SOCIAL_FORMATS, SOCIAL_SLIDES, type SocialFormat } from "@/lib/newwave/grasrot/social";
import type { ColorMode } from "@/lib/newwave/vector/write";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const club = grasrotClub((await params).id);
  return { title: `Craft · Gräsrot 360 · ${club?.name ?? "Förening"}` };
}

const LABEL: Record<Variant, string> = { original: "Original", solid: "Solid", negativ: "Negativ" };
const MODE: Record<ColorMode, string> = { spot: "Pantone", cmyk: "CMYK", rgb: "RGB" };
const DOT: Record<Check["level"], string> = { ok: "bg-[#2E9E5B]", varning: "bg-[#E0A100]", stopp: "bg-[#D92D20]" };
/** Leveransen i samma ordning som uppdraget: märke, kulörer, wordmark, webbshop, herobild, sociala medier, produktion. */
const SECTIONS = [
  ["klubbmarke", "Klubbmärke"],
  ["kulorer", "Kulörer"],
  ["ordmarke", "Wordmark"],
  ["webbshop", "Webbshop"],
  ["herobild", "Herobild"],
  ["sociala-medier", "Sociala medier"],
  ["produktion", "Produktion"],
] as const;
const section = "mt-10 scroll-mt-20";
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
  const preview = (
    <img src={fileHref(id, fileName(artwork, variant, "svg"))} alt={`${name} ${artwork === "ordmarke" ? "wordmark" : "klubbmärke"}, ${LABEL[variant].toLowerCase()}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-4" />
  );
  return (
    <li className="flex min-w-0 flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-3">
      {/* Negativet är vitt på transparent och ser tomt ut öppnat för sig; det visas bara här, på klubbfärgen. */}
      {variant === "negativ" ? (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[var(--club)]">{preview}</div>
      ) : (
        <a href={fileHref(id, fileName(artwork, variant, "svg"))} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-[var(--nw-soft)]">
          {preview}
        </a>
      )}
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
    { artwork: "ordmarke", title: "Wordmark", text: `Gräsrot 360-wordmarket med ${club.words ? `${club.words.caps} och ${club.words.script}` : "föreningens namn"}, rutbandet i föreningens färger och märket i en färg. ${FONT_CHECK.text}` },
  ];
  const checks = Object.fromEntries(
    await Promise.all(artworks.flatMap(({ artwork }) => VARIANTS.map(async (v) => [`${artwork}-${v}`, ((await printChecks(id, artwork, v)) ?? []).filter((c) => c.text !== set.quality.note && c.text !== FONT_CHECK.text)] as const))),
  );
  const quality: Check["level"] = set.quality.ready ? (set.quality.kind === "vektor" ? "ok" : "varning") : "stopp";
  const [hero, shop] = await Promise.all([heroImage(id), shopProducts(id)]);
  if (!shop) notFound();
  const { products, featured } = shop;
  const base = `/api/v1/newwave/grasrot/${id}`;
  const at = GRASROT_CLUBS.findIndex((c) => c.id === id);
  const [prev, next] = [GRASROT_CLUBS[(at + GRASROT_CLUBS.length - 1) % GRASROT_CLUBS.length], GRASROT_CLUBS[(at + 1) % GRASROT_CLUBS.length]];

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
          {set.quality.note}. <span className="text-[var(--nw-muted)]">Källa: {club.source.from}.</span>
        </span>
      </p>

      <div className="mt-6 flex flex-col gap-3 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="nw-club-heading text-[17px]">Hela leveransen i ett paket</p>
          <p className="mt-1 text-[13.5px] text-white/70">
            Klubbmärke och wordmark ({FILE_SET.length} filer i Pantone, CMYK och RGB), kulörer som färgprover, webbshopens produktbilder i alla färger, herobilden, inlägg för sociala medier och produktionsunderlag per
            leverantör – med en läs mig-fil.
          </p>
        </div>
        <PackageDownload href={fileHref(id, "paket.zip")} name={`${id}-grasrot-360.zip`} />
      </div>

      <nav aria-label="Leveransen" className="mt-4 flex flex-wrap gap-2">
        {SECTIONS.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="rounded-full border border-[var(--nw-line)] px-3 py-1 text-[13px] font-medium text-[var(--nw-ink)] hover:border-[var(--club)] hover:text-[var(--club)]">
            {label}
          </a>
        ))}
      </nav>

      {artworks.slice(0, 1).map(({ artwork, title, text }) => (
        <section key={artwork} id={artwork} className={section}>
          <h2 className="nw-club-heading text-[19px] text-[var(--club)]">{title}</h2>
          <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">{text}</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {VARIANTS.map((v) => (
              <Tile key={v} id={id} name={club.name} artwork={artwork} variant={v} checks={checks[`${artwork}-${v}`]} />
            ))}
          </ul>
        </section>
      ))}

      <section id="kulorer" className={section}>
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
              <span className="shrink-0 rounded-full bg-[var(--nw-soft)] px-2.5 py-0.5 text-[12px] text-[var(--nw-ink)]">{inkSource(club, i.source)}</span>
            </li>
          ))}
        </ul>
      </section>

      {artworks.slice(1).map(({ artwork, title, text }) => (
        <section key={artwork} id={artwork} className={section}>
          <h2 className="nw-club-heading text-[19px] text-[var(--club)]">{title}</h2>
          <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">{text}</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {VARIANTS.map((v) => (
              <Tile key={v} id={id} name={club.name} artwork={artwork} variant={v} checks={checks[`${artwork}-${v}`]} />
            ))}
          </ul>
        </section>
      ))}

      <section id="webbshop" className={section}>
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Webbshop – produkterna i Bilaga 2</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">
          Ensamstående klubbmärke eller wordmark på varje produkt, i leverantörens färger. T-shirtens wordmark är i klubbens färger på ljusa plagg och vitt på mörka; hoodien och kepsen har märket i original på alla färger; flaskan trycks på ljusa och graveras på mörka. Vrid produkten i 3D eller se fotot.
        </p>
        <GrasrotShop id={id} products={products} featured={featured} />
      </section>

      <section id="herobild" className={section}>
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Herobild</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">
          Produkterna på klubbstugans veranda under sommarfesten, i de färger ur sortimentet som ligger närmast föreningens
          {hero ? `: ${GRASROT_PRODUCTS.filter((p) => p.id !== "halsduk" && hero.info.colors[p.id]).map((p) => `${p.short.toLowerCase()} i ${colorSv(hero.info.colors[p.id]).toLowerCase()}`).join(", ")}` : ""}. Miljön är skapad av bildmodellen med webbshopens produktbilder som förlaga; klubbmärkena på produkterna är lagda från tryckfilerna.
        </p>
        <a href={`${base}/herobild.jpg`} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-[var(--nw-radius)] ring-1 ring-[var(--nw-line)]">
          <img src={`${base}/herobild.jpg`} alt={`${club.name}s produkter på klubbstugans veranda`} className="aspect-video w-full object-cover" />
        </a>
        <a href={`${base}/herobild.jpg?dl=1`} className={`${link} mt-2 inline-block text-[13px]`}>
          Ladda ner herobilden (1920 × 1080)
        </a>
      </section>

      <section id="sociala-medier" className={section}>
        <h2 className="nw-club-heading text-[19px] text-[var(--club)]">Sociala medier</h2>
        <p className="mt-0.5 max-w-[720px] text-[13.5px] text-[var(--nw-muted)]">Herobilden följd av varje produkt, för flödet och för stories – med en färdig bildtext till varje inlägg. Klicka på en bild för full storlek.</p>
        {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
          <div key={f} className="mt-4">
            <p className="text-[12.5px] font-medium text-[var(--nw-muted)]">
              {SOCIAL_FORMATS[f].label} · {SOCIAL_FORMATS[f].w} × {SOCIAL_FORMATS[f].h}
            </p>
            <ul className={`mt-2 grid gap-2 ${f === "feed" ? "grid-cols-3 md:grid-cols-6" : "grid-cols-3 sm:grid-cols-6"}`}>
              {SOCIAL_SLIDES.map((name) => (
                <li key={name} className="min-w-0">
                  <a href={`${base}/social-${f}-${name}.jpg`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-[var(--nw-line)]" aria-label={`Öppna ${name} (${SOCIAL_FORMATS[f].label})`}>
                    <img src={`${base}/social-${f}-${name}.jpg`} alt="" loading="lazy" className={`w-full object-cover ${f === "feed" ? "aspect-[4/5]" : "aspect-[9/16]"}`} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-6 text-[12.5px] font-medium text-[var(--nw-muted)]">Bildtexter</p>
        <ol className="mt-2 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
          {captions(club).map((c, i) => (
            <li key={c.slide} className="flex items-start gap-3 py-2.5">
              <span className="nw-mono w-6 shrink-0 pt-px text-[12px] text-[var(--nw-muted)]">{String(i + 1).padStart(2, "0")}</span>
              <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[var(--nw-ink)]">{c.text}</p>
              <CopyButton text={c.text} />
            </li>
          ))}
        </ol>
        <a href={`${base}/bildtexter.txt?dl=1`} className={`${link} mt-2 inline-block text-[13px]`}>
          Ladda ner bildtexterna (TXT)
        </a>
      </section>

      <section id="produktion" className={section}>
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

      <nav aria-label="Föreningarna" className="mt-12 flex items-center justify-between gap-3 border-t border-[var(--nw-line)] pt-5 text-[14px]">
        <Link href={`/newwave/craft/grasrot/${prev.id}`} className="min-w-0 truncate text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
          ← {prev.name}
        </Link>
        <Link href="/newwave/craft/grasrot" className="shrink-0 text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
          Alla föreningar
        </Link>
        <Link href={`/newwave/craft/grasrot/${next.id}`} className="min-w-0 truncate text-right font-medium text-[var(--nw-ink)] hover:underline">
          {next.name} →
        </Link>
      </nav>
    </div>
  );
}
