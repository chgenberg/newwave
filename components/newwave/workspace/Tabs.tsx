"use client";

import Link from "next/link";
import { useState } from "react";
import { type BrandKit, kitAccent } from "@/lib/newwave/brandKit";
import { NW_CATALOG, nwProduct } from "@/lib/newwave/catalog";
import { METHOD_INFO, type Design, designSummary, estimate, fmtWeekday, zoneLabel } from "@/lib/newwave/marking";
import { type OccasionId, occasion } from "@/lib/newwave/occasions";
import { sek } from "@/lib/newwave/reseller";
import { luminance } from "@/lib/newwave/theme";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { PLACEHOLDER } from "../shop/cart";
import { ProductMock } from "../shop/ProductMock";
import { ShopFrame, ShopHome } from "../shop/Storefront";

/** `sent` när produkten lagts ut, skickats eller offererats; en ny design nollställer den. */
export type Item = { id: string; color: string; design: Design; preview?: string; sent?: boolean };

export const PAGE = "mx-auto w-full max-w-[1100px] px-5 py-8 min-[900px]:px-10 min-[900px]:py-10";
export const H = "text-[26px] font-semibold tracking-[-0.03em] min-[900px]:text-[32px]";
export const LEAD = "mt-1 max-w-[56ch] text-[14px] leading-relaxed text-[#6F6B63]";
export const GHOST = "inline-flex h-10 items-center rounded-full border border-[rgba(17,17,17,0.14)] px-4 text-[13px] font-semibold transition hover:border-[#111]";
export const SOLID = "inline-flex h-11 items-center gap-2 rounded-full bg-[var(--shop)] px-5 text-[14px] font-semibold text-[var(--shop-on)] transition hover:opacity-90 active:scale-[0.97]";

/** Designens ordmärke ritat med en klubbs namn, färger och märke. */
export const wordmarkLogos = (d: Design, clubId: string) => (d.wordmark ? { logo: wordmarkUrl(d.wordmark, clubId, "light", 1200, "png", d.sizeCm), logoDark: wordmarkUrl(d.wordmark, clubId, "dark", 1200, "png", d.sizeCm) } : null);

export const logoOf = (kit: BrandKit, d: Design, clubId?: string) =>
  (clubId && wordmarkLogos(d, clubId)) || { logo: d.logo ?? kit.logo ?? PLACEHOLDER.light, logoDark: d.logo ? d.logoDark : (kit.logoDark ?? (kit.logo ? undefined : PLACEHOLDER.dark)) };

export function Empty({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-8 grid place-items-center rounded-[22px] border border-dashed border-[rgba(17,17,17,0.18)] px-6 py-16 text-center">
      <p className="text-[15px] font-semibold">Kollektionen är tom</p>
      <p className="mt-1 max-w-[40ch] text-[13.5px] text-[#6F6B63]">Spara en design i studion, eller skapa en hel kollektion med varumärket på en gång.</p>
      <button type="button" onClick={onStart} className={`${SOLID} mt-5`}>
        Skapa kollektion →
      </button>
    </div>
  );
}

/** Återförsäljarens tillfällen: samma kollektioner som kunderna sätter ihop i butikens eventverktyg. */
type Occasions = { offered: OccasionId[]; current: OccasionId | null; onPick: (id: OccasionId) => void; slug: string };

export function CollectionTab({ kit, club, items, onEdit, onRemove, onStart, next, occasions }: { kit: BrandKit; club?: string; items: Item[]; onEdit: (id: string) => void; onRemove: (id: string) => void; onStart: () => void; next: { label: string; go: () => void }; occasions?: Occasions }) {
  const total = items.reduce((sum, i) => sum + (nwProduct(i.id)?.priceSek ?? 0), 0);
  const current = occasions?.current ? occasion(occasions.current) : undefined;
  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">{kit.name}</p>
      <h2 className={H}>{current ? `Kollektion för ${current.name.toLowerCase()}` : "Kollektion"}</h2>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className={LEAD}>{occasions && !items.length ? "Välj ett tillfälle så sätter vi ihop kollektionen med ert varumärke. Era kunder gör samma sak i butiken." : "Allt ni har designat i samma varumärke. Öppna en produkt för att ändra trycket."}</p>
        {items.length ? (
          <button type="button" onClick={next.go} className={SOLID}>
            {next.label} <span aria-hidden>→</span>
          </button>
        ) : null}
      </div>
      {occasions && items.length ? <OccasionChips occasions={occasions} /> : null}
      {items.length ? (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
            {items.map((i) => {
              const p = nwProduct(i.id);
              if (!p) return null;
              return (
                <li key={i.id} className="group overflow-hidden rounded-[20px] bg-[#F4F4F2]">
                  <button type="button" onClick={() => onEdit(i.id)} className="block w-full text-left" aria-label={`Öppna ${p.name} i studion`}>
                    {i.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.preview} alt={p.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <ProductMock product={p} {...logoOf(kit, i.design, club)} zone={i.design.zone} className="transition duration-500 group-hover:scale-[1.03]" />
                    )}
                  </button>
                  <div className="flex items-start justify-between gap-2 bg-white px-3.5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[12px] text-[#6F6B63]">{i.sent ? "✓ Skickad · " : ""}{designSummary(p, i.design)}</span>
                    </span>
                    <button type="button" onClick={() => onRemove(i.id)} aria-label={`Ta bort ${p.name}`} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[16px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111]">
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-[13.5px] text-[#6F6B63]">
            {items.length} {items.length === 1 ? "produkt" : "produkter"} · från {sek(total)} för en av varje
          </p>
          {occasions ? <InShop slug={occasions.slug} /> : null}
        </>
      ) : occasions ? (
        <OccasionStart occasions={occasions} onStart={onStart} />
      ) : (
        <Empty onStart={onStart} />
      )}
    </div>
  );
}

function OccasionStart({ occasions, onStart }: { occasions: Occasions; onStart: () => void }) {
  return (
    <>
      <ul className="mt-8 grid grid-cols-2 gap-3 min-[1100px]:grid-cols-3">
        {occasions.offered.map((id) => {
          const o = occasion(id)!;
          return (
            <li key={id}>
              <button type="button" onClick={() => occasions.onPick(id)} className="group block w-full overflow-hidden rounded-[20px] bg-white text-left shadow-[inset_0_0_0_1px_rgba(17,17,17,0.08)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.3),0_18px_40px_-28px_rgba(17,17,17,0.5)]">
                <span className="block aspect-[3/2] overflow-hidden bg-[#F4F4F2]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.scene} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" loading="lazy" />
                </span>
                <span className="flex items-start justify-between gap-2 px-3.5 py-3">
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold">{o.name}</span>
                    <span className="block truncate text-[12px] text-[#6F6B63]">{o.hint}</span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#6F6B63]">{o.products.length} st</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onStart} className="text-[13px] font-medium text-[#6F6B63] underline underline-offset-4 hover:text-[#111]">
          Eller skapa en kollektion utan tillfälle
        </button>
        <InShop slug={occasions.slug} compact />
      </div>
    </>
  );
}

function OccasionChips({ occasions }: { occasions: Occasions }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Tillfälle">
      <span className="text-[12.5px] text-[#6F6B63]">Tillfälle</span>
      {occasions.offered.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={occasions.current === id}
          onClick={() => occasions.onPick(id)}
          className="h-8 rounded-full px-3 text-[12.5px] font-medium shadow-[inset_0_0_0_1px_rgba(17,17,17,0.14)] transition hover:shadow-[inset_0_0_0_1px_#111] aria-pressed:bg-[#111] aria-pressed:text-white"
        >
          {occasion(id)!.name}
        </button>
      ))}
    </div>
  );
}

/** Påminner om att kunderna har samma verktyg i återförsäljarens butik. */
function InShop({ slug, compact }: { slug: string; compact?: boolean }) {
  const href = `/newwave/s/${slug}#event`;
  if (compact)
    return (
      <Link href={href} className="text-[13px] font-medium underline underline-offset-4">
        Se hur kunderna gör det i butiken →
      </Link>
    );
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[#F4F4F2] px-5 py-4">
      <p className="max-w-[60ch] text-[13.5px] leading-snug">Era kunder kan göra samma sak i butiken: välja tillfälle, lägga in loggan och beställa hela kollektionen direkt.</p>
      <Link href={href} className={GHOST}>
        Öppna eventsidan →
      </Link>
    </div>
  );
}

export function ShopTab({ kit, items, onStart }: { kit: BrandKit; items: Item[]; onStart: () => void }) {
  const primary = kitAccent(kit);
  const accent = kit.colors.find((c) => c.hex !== primary && luminance(c.hex) < 0.85)?.hex ?? primary;
  const shop = {
    slug: "studio",
    name: kit.name,
    logo: kit.logo ?? undefined,
    theme: { primary, accent, background: "#F6F6F3" },
    texts: { shopName: kit.name, tagline: "Klubbshop", heroTitle: `${kit.name} – kollektionen`, heroText: "Allt i klubbens färger, tryckt på beställning.", about: "", email: "", phone: "" },
    products: items.length ? items.map((i) => i.id) : NW_CATALOG.slice(0, 8).map((p) => p.id),
    markup: 0,
  };
  return (
    <div className={PAGE}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nw-kicker text-[#6F6B63]">Förhandsvisning</p>
          <h2 className={H}>Klubbshop</h2>
          <p className={LEAD}>Så ser butiken ut med varumärket och kollektionen. Färger och logga följer med automatiskt.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length ? null : (
            <button type="button" onClick={onStart} className={GHOST}>
              Skapa kollektion
            </button>
          )}
          <Link href="/newwave/shop/butiken" className={SOLID}>
            Bygg butiken →
          </Link>
        </div>
      </div>
      <div className="mt-8 overflow-hidden rounded-[22px] shadow-[0_0_0_1px_rgba(17,17,17,0.08),0_30px_60px_-40px_rgba(17,17,17,0.45)]">
        <div className="flex h-9 items-center gap-1.5 border-b border-[rgba(17,17,17,0.08)] bg-[#FAFAF8] px-4" aria-hidden>
          <i className="h-2.5 w-2.5 rounded-full bg-[#E2E1DC]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#E2E1DC]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#E2E1DC]" />
        </div>
        <div className="pointer-events-none select-none" aria-hidden>
          <ShopFrame shop={shop} preview>
            <ShopHome shop={shop} preview />
          </ShopFrame>
        </div>
      </div>
    </div>
  );
}

/** Laddar ner tryckfilerna för en position; servern gör dem med samma motor som hubbens leveranser. */
function PrintFiles({ kit, club, item, position, label }: { kit: BrandKit; club?: string; item: Item; position: number; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const download = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/v1/newwave/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: item.id, color: item.color, design: item.design, position, name: kit.name, palette: kit.colors.map((c) => c.hex), club, art: logoOf(kit, item.design, club) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "tryckfiler.zip";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return (
    <button type="button" onClick={download} disabled={state === "busy"} aria-label={`Tryckfiler för ${label}`} className="shrink-0 text-[12.5px] font-semibold underline decoration-[rgba(17,17,17,0.25)] underline-offset-2 transition hover:decoration-[#111] disabled:opacity-50">
      {state === "busy" ? "Gör filerna…" : state === "error" ? "Försök igen" : "Tryckfiler (zip)"}
    </button>
  );
}

export function ProductionTab({ kit, club, items, onStart }: { kit: BrandKit; club?: string; items: Item[]; onStart: () => void }) {
  const [today] = useState(() => new Date());
  const rows = items.flatMap((i) => {
    const p = nwProduct(i.id);
    return p ? [{ i, p, d: estimate(p, i.design, today) }] : [];
  });
  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">New Wave trycker</p>
      <h2 className={H}>Produktion</h2>
      <p className={LEAD}>Korrektur, tryck och frakt räknat i arbetsdagar från i dag. Varje position trycks med den metod ni valt i studion, och tryckfilerna går att ladda ner per position.</p>
      {rows.length ? (
        <ol className="mt-8 divide-y divide-[rgba(17,17,17,0.08)] overflow-hidden rounded-[20px] border border-[rgba(17,17,17,0.08)] bg-white">
          {rows.map(({ i, p, d }) => {
            const spots = [i.design, ...(i.design.extra ?? [])];
            return (
              <li key={i.id} className="px-4 py-3">
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.preview ?? p.photo} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-[#F4F4F2] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                    <span className="block truncate text-[12.5px] text-[#6F6B63]">
                      {METHOD_INFO[d.method].label} · {METHOD_INFO[d.method].blurb.toLowerCase()}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[14px] font-semibold">{fmtWeekday(d.date)}</span>
                    <span className="nw-mono block text-[12px] text-[#6F6B63]">{d.days} arbetsdagar</span>
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 pl-16">
                  {spots.map((s, n) => {
                    const label = `${spots.length > 1 ? `Tryck ${n + 1} · ` : ""}${zoneLabel(p, s.zone)}`;
                    return (
                      <li key={n} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{label}</span>
                          <span className="text-[#6F6B63]">
                            {" "}
                            · {s.sizeCm.toLocaleString("sv-SE")} cm · {METHOD_INFO[s.method].label.toLowerCase()}
                            {n === 0 && i.design.names?.list.length ? ` · plus ${i.design.names.list.length} namn på ${zoneLabel(p, i.design.names.zone).toLowerCase()}` : ""}
                          </span>
                        </span>
                        <PrintFiles kit={kit} club={club} item={i} position={n} label={`${p.name}, ${label.toLowerCase()}`} />
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty onStart={onStart} />
      )}
    </div>
  );
}
