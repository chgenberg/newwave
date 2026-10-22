import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubWordmarks } from "@/components/newwave/ClubWordmarks";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";
import { CopyLink } from "@/components/newwave/shop/QuoteActions";
import { ACCESS_COOKIE, accessToken } from "@/lib/access";
import { clubLink } from "@/lib/newwave/clubLink";
import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { defaultDesign } from "@/lib/newwave/marking";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { readPrefs } from "@/lib/newwave/wordmark/clubPrefs";
import { COLLECTIONS } from "@/lib/newwave/wordmark/collections";
import { clubMoments } from "@/lib/newwave/wordmark/moments";
import { clubQuality } from "@/lib/newwave/wordmark/quality";
import { lacksText, textsFor } from "@/lib/newwave/wordmark/render";
import { fitScore } from "@/lib/newwave/wordmark/schema";
import { type SocialKind, type WordmarkSpec, wordmarkSocialUrl, wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { templateStats } from "@/lib/newwave/wordmark/stats";
import { allTemplates, wordmarkClub } from "@/lib/newwave/wordmark/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const club = await wordmarkClub((await params).id);
  return { title: club ? `${club.name} · Ordmärken · Next Wave` : "Next Wave" };
}

const SOCIAL: { kind: SocialKind; label: string; aspect: string }[] = [
  { kind: "profil", label: "Profilbild", aspect: "aspect-square" },
  { kind: "banner", label: "Omslagsbild", aspect: "aspect-[3/1]" },
  { kind: "story", label: "Story", aspect: "aspect-[9/16]" },
  { kind: "anim", label: "Animerat, för webben", aspect: "aspect-square" },
];

/**
 * Förhandsvisningen som Craft skickar till en klubb: klubbens bästa ordmärken på plaggen, kollektionerna, kommande
 * tillfällen och de digitala formaten – och längst ner rättar klubben namn och färger, väljer favoriter och godkänner.
 */
export default async function ClubPreviewPage({ params }: Props) {
  const { id } = await params;
  const club = await wordmarkClub(id);
  if (!club) notFound();
  const [prefs, templates, stats, quality] = await Promise.all([readPrefs(id), allTemplates(), templateStats(), clubQuality(id)]);
  const whiteLogo = Boolean(quality?.issues.some((i) => i.id === "logo-white"));
  const texts = textsFor(club, {});
  const chars = [...texts.name2].length;
  const favs = new Set(prefs.favorites);
  const ranked = templates
    .filter((t) => !t.hidden && t.style !== "Rygg" && !lacksText(t, texts))
    .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || fitScore(b, chars) - fitScore(a, chars) || (stats[b.id]?.score ?? 0) - (stats[a.id]?.score ?? 0));
  const top = ranked.slice(0, 8);
  const has = new Set(ranked.map((t) => t.id));
  const v = encodeURIComponent(prefs.updatedAt ?? "");
  const spec = (template: string, worn?: boolean): WordmarkSpec => ({ template, icon: true, ornament: true, ...(worn ? { worn: true } : {}) });
  const wm = (s: WordmarkSpec, dark: boolean, size = 1200, cm?: number) => `${wordmarkUrl(s, id, dark ? "dark" : "light", size, "png", cm)}&u=${v}`;
  const mockup = (p: NwProduct, s: WordmarkSpec, size = 800) => {
    const d = defaultDesign(p);
    return `/api/v1/newwave/mockup?p=${p.id}&l=${encodeURIComponent(wm(s, p.dark, 1200, d.sizeCm))}&s=${size}&z=${d.zone}`;
  };
  const hero = (["p001", "p004", "p011"] as const).flatMap((pid, i) => {
    const p = nwProduct(pid);
    return p && top[i] ? [{ p, t: top[i] }] : [];
  });
  const moments = clubMoments(club);
  const first = top[0]?.id ?? "campus";
  // Klubben själv kommer via sin länk utan demolösenordet; då visas varken länken eller vägar in i demot.
  const password = process.env.DEMO_PASSWORD;
  const insider = !password || (await cookies()).get(ACCESS_COOKIE)?.value === (await accessToken(password));
  const link = insider ? await clubLink(id) : null;
  const brand = (
    <>
      <LogoMark size={28} />
      <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:px-6">
          {insider ? (
            <Link href="/newwave/start" className="flex min-h-9 shrink-0 items-center gap-2.5" aria-label="Next Wave">
              {brand}
            </Link>
          ) : (
            <span className="flex min-h-9 shrink-0 items-center gap-2.5" aria-label="Next Wave">
              {brand}
            </span>
          )}
          <span className="truncate text-[14px] text-[#6F6B63]">Förhandsvisning för {club.name}</span>
          <a href="#godkann" className="ml-auto inline-flex h-10 shrink-0 items-center rounded-full bg-[#111] px-4 text-[13.5px] font-medium text-white transition hover:bg-[#333]">
            Godkänn
          </a>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-14 pt-8 min-[900px]:px-10">
          {link ? (
            <div className="mb-8 flex flex-col gap-3 rounded-[18px] bg-[#F2F1EE] p-4 min-[760px]:flex-row min-[760px]:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">Länken till {club.name}</p>
                <p className="mt-0.5 text-[13px] text-[#6F6B63]">Öppnar bara den här sidan, utan lösenord. Det klubben rättar och godkänner syns direkt i Craft.</p>
                <p className="mt-1 truncate font-mono text-[12px] text-[#4A4740]">{link}</p>
              </div>
              <CopyLink url={link} label="Kopiera länken" />
            </div>
          ) : null}
          <section className="flex flex-col items-start gap-5 min-[760px]:flex-row min-[760px]:items-center">
            {club.logo ? (
              <span className={`grid h-24 w-24 shrink-0 place-items-center rounded-[22px] p-3 ${whiteLogo ? "bg-[#1B1B1D]" : "bg-[#F2F1EE]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- klubbens märke */}
                <img src={club.logo} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">Craft × {club.name}</p>
              <h1 className="mt-1 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] min-[760px]:text-[44px]">{club.name} i vintagestil</h1>
              <p className="mt-2 max-w-[640px] text-[15.5px] leading-relaxed text-[#4A4740]">
                Så kan klubbens egna kläder se ut – med {genitive(club.name)} namn, färger och märke, ritade i samma stil som amerikanska college- och NFL-tryck. Inget är tryckt än: välj favoriter, rätta det som inte stämmer och godkänn.
              </p>
            </div>
          </section>

          {hero.length ? (
            <section className="mt-10">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em]">På plaggen</h2>
              <ul className="mt-3 grid gap-3 min-[700px]:grid-cols-3">
                {hero.map(({ p, t }) => (
                  <li key={p.id} className="min-w-0 overflow-hidden rounded-[20px] bg-[#F2F1EE]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- mockup per klubb */}
                    <img src={mockup(p, spec(t.id))} alt={`${p.name} med ${t.name}`} className="aspect-square w-full object-cover" />
                    <p className="px-4 py-3 text-[13.5px]">
                      <span className="font-semibold">{p.name}</span> <span className="text-[#6F6B63]">· {t.name}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Ordmärken för {club.name}</h2>
            <p className="text-[13.5px] text-[#6F6B63]">De som passar namnet bäst först{favs.size ? ", klubbens favoriter överst" : ""}.</p>
            <ul className="mt-3 grid grid-cols-2 gap-2.5 min-[700px]:grid-cols-4">
              {top.map((t, i) => (
                <li key={t.id} className="min-w-0">
                  <div className={`relative grid aspect-[4/3] place-items-center overflow-hidden rounded-[16px] ${i % 3 === 1 ? "bg-[#1C1C1E]" : "bg-[#F2F1EE]"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                    <img src={wm(spec(t.id), i % 3 === 1, 800)} alt={`${t.name} med ${club.name}`} loading="lazy" className="absolute inset-0 h-full w-full object-contain p-[9%]" />
                    {favs.has(t.id) ? <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 text-[11.5px] font-medium text-[#C8102E]">♥ Favorit</span> : null}
                  </div>
                  <p className="mt-1 truncate text-[12.5px]">
                    <span className="font-medium">{t.name}</span> <span className="text-[#6F6B63]">· {t.style}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Kollektioner</h2>
            <p className="text-[13.5px] text-[#6F6B63]">Hela sortimentet i samma stil – små tryck som keps och bröst får den lilla versionen automatiskt.</p>
            <ul className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
              {COLLECTIONS.map((c) => (
                <li key={c.id} className="rounded-[20px] border border-[rgba(17,17,17,0.08)] p-3">
                  <p className="px-1 text-[15px] font-semibold">
                    {c.name} <span className="font-normal text-[#6F6B63]">· {c.items.length} produkter</span>
                  </p>
                  <p className="px-1 text-[13px] text-[#6F6B63]">{c.blurb}</p>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {c.items.slice(0, 3).flatMap((it) => {
                      const p = nwProduct(it.product);
                      return p ? (
                        <figure key={it.product} className="min-w-0">
                          {/* eslint-disable-next-line @next/next/no-img-element -- mockup per klubb */}
                          <img src={mockup(p, spec(it.template, c.worn), 480)} alt={`${p.name} – ${c.name}`} loading="lazy" className="aspect-square w-full rounded-[12px] bg-[#F2F1EE] object-cover" />
                          <figcaption className="mt-1 truncate text-[12px] text-[#6F6B63]">{p.name}</figcaption>
                        </figure>
                      ) : [];
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {moments.length ? (
            <section className="mt-10">
              <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Kommande tillfällen</h2>
              <ul className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
                {moments.map((m) => {
                  const t = m.templates.find((x) => has.has(x)) ?? first;
                  return (
                    <li key={m.title} className="flex gap-3 rounded-[20px] bg-[#F2F1EE] p-3">
                      <span className="relative grid h-24 w-28 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                        <img src={wm(spec(t), false, 480)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">
                          {m.title} <span className="font-normal text-[#6F6B63]">· {m.when}</span>
                        </p>
                        <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug text-[#4A4740]">{m.why}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="mt-10">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Digitalt</h2>
            <p className="text-[13.5px] text-[#6F6B63]">Samma ordmärke på klubbens huvudfärg, färdigt för sociala medier och hemsidan.</p>
            <ul className="mt-3 grid grid-cols-2 items-start gap-3 min-[900px]:grid-cols-[1fr_2fr_0.6fr_1fr]">
              {SOCIAL.map((s) => {
                const src = `${wordmarkSocialUrl(spec(first), id, s.kind)}&u=${v}`;
                return (
                  <li key={s.kind} className="min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ritas per klubb */}
                    <img src={src} alt={`${s.label} för ${club.name}`} loading="lazy" className={`w-full rounded-[14px] bg-[#F2F1EE] object-cover ${s.aspect}`} />
                    <a href={src} download={`${id}-${s.kind}.${s.kind === "anim" ? "svg" : "png"}`} className="mt-1 inline-block text-[12.5px] text-[#6F6B63] underline underline-offset-4 hover:text-[#111]">
                      {s.label} ↓
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>

          <section id="godkann" className="mt-12 scroll-mt-24 rounded-[24px] bg-[#F7F6F3] p-4 min-[900px]:p-6">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Rätta och godkänn</h2>
            <ClubWordmarks clubId={id} />
          </section>
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
