"use client";

import Link from "next/link";
import { useState } from "react";
import { type BrandKit, kitAccent } from "@/lib/newwave/brandKit";
import { NW_CATALOG, nwProduct } from "@/lib/newwave/catalog";
import { METHOD_INFO, type Design, designSummary, estimate, fmtWeekday, onChest } from "@/lib/newwave/marking";
import { sek } from "@/lib/newwave/reseller";
import { luminance } from "@/lib/newwave/theme";
import { PLACEHOLDER } from "../shop/cart";
import { ProductMock } from "../shop/ProductMock";
import { ShopFrame, ShopHome } from "../shop/Storefront";

export type Item = { id: string; color: string; design: Design; preview?: string };

const PAGE = "mx-auto w-full max-w-[1100px] px-5 py-8 min-[900px]:px-10 min-[900px]:py-10";
const H = "text-[26px] font-semibold tracking-[-0.03em] min-[900px]:text-[32px]";
const LEAD = "mt-1 max-w-[56ch] text-[14px] leading-relaxed text-[#6F6B63]";
const GHOST = "inline-flex h-10 items-center rounded-full border border-[rgba(17,17,17,0.14)] px-4 text-[13px] font-semibold transition hover:border-[#111]";
const SOLID = "inline-flex h-11 items-center gap-2 rounded-full bg-[var(--shop)] px-5 text-[14px] font-semibold text-[var(--shop-on)] transition hover:opacity-90 active:scale-[0.97]";

const logoOf = (kit: BrandKit, d: Design) => ({ logo: d.logo ?? kit.logo ?? PLACEHOLDER.light, logoDark: d.logo ? d.logoDark : (kit.logoDark ?? PLACEHOLDER.dark) });

function Empty({ onStart }: { onStart: () => void }) {
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

export function CollectionTab({ kit, items, onEdit, onRemove, onStart }: { kit: BrandKit; items: Item[]; onEdit: (id: string) => void; onRemove: (id: string) => void; onStart: () => void }) {
  const total = items.reduce((sum, i) => sum + (nwProduct(i.id)?.priceSek ?? 0), 0);
  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">{kit.name}</p>
      <h2 className={H}>Kollektion</h2>
      <p className={LEAD}>Allt ni har designat i samma varumärke. Öppna en produkt för att ändra trycket, eller lägg den i klubbshopen.</p>
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
                      <ProductMock product={p} {...logoOf(kit, i.design)} chest={onChest(i.design)} className="transition duration-500 group-hover:scale-[1.03]" />
                    )}
                  </button>
                  <div className="flex items-start justify-between gap-2 bg-white px-3.5 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[12px] text-[#6F6B63]">{designSummary(p, i.design)}</span>
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
        </>
      ) : (
        <Empty onStart={onStart} />
      )}
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

export function ProductionTab({ items, onStart }: { items: Item[]; onStart: () => void }) {
  const [today] = useState(() => new Date());
  const rows = items.flatMap((i) => {
    const p = nwProduct(i.id);
    return p ? [{ i, p, d: estimate(p, i.design, today) }] : [];
  });
  const last = rows.reduce((max, r) => (r.d.date > max ? r.d.date : max), "");
  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">New Wave trycker</p>
      <h2 className={H}>Produktion</h2>
      <p className={LEAD}>Korrektur, tryck och frakt räknat i arbetsdagar från i dag. Varje produkt trycks med den metod ni valt i studion.</p>
      {rows.length ? (
        <>
          <ol className="mt-8 divide-y divide-[rgba(17,17,17,0.08)] overflow-hidden rounded-[20px] border border-[rgba(17,17,17,0.08)] bg-white">
            {rows.map(({ i, p, d }) => (
              <li key={i.id} className="flex items-center gap-4 px-4 py-3">
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
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#F4F4F2] px-5 py-4">
            <p className="text-[14px]">
              Hela kollektionen är framme <b>{fmtWeekday(last)}</b>.
            </p>
            <Link href="/newwave/new-wave/ordrar" className={GHOST}>
              Se tryckflödet hos New Wave →
            </Link>
          </div>
        </>
      ) : (
        <Empty onStart={onStart} />
      )}
    </div>
  );
}
