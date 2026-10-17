"use client";

import { useEffect, useState } from "react";
import { type BrandKit, DEFAULT_KIT, kitAccent, readKit } from "@/lib/newwave/brandKit";
import { CATEGORIES, NW_CATALOG, type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { defaultDesign, sanitizeDesign } from "@/lib/newwave/marking";
import { HubSwitch } from "../HubSwitch";
import { LogoMark } from "../Logo";
import { PLACEHOLDER } from "../shop/cart";
import { ProductMock } from "../shop/ProductMock";
import { DesignStudio, type StudioResult } from "../studio/DesignStudio";
import { BrandTools } from "./BrandTools";
import { CollectionTab, type Item, ProductionTab, ShopTab } from "./HomeTabs";

const STORE_KEY = "nw.studio.home";

const TABS = [
  { id: "design", label: "Design" },
  { id: "kollektion", label: "Kollektion" },
  { id: "klubbshop", label: "Klubbshop" },
  { id: "produktion", label: "Produktion" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Det som visas under "Skapa även": samma tryck på fler produkter. */
const ALSO = ["p004", "p012", "p009", "p020", "p001"];
const START = "p001";

const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

function readItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = r && typeof r.id === "string" ? nwProduct(r.id) : undefined;
    const design = p ? sanitizeDesign(p, r.design) : undefined;
    return p && design
      ? [
          {
            id: p.id,
            color: typeof r.color === "string" ? r.color : p.garmentHex,
            design,
          },
        ]
      : [];
  });
}

function Picker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const [cat, setCat] = useState(nwProduct(current)?.category ?? CATEGORIES[0]);
  return (
    <div>
      <p className="drawer-label">Produkt</p>
      <div className="cz-chips mb-3" role="group" aria-label="Kategori">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={c === cat} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {NW_CATALOG.filter((p) => p.category === cat).map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} aria-pressed={p.id === current} className="group overflow-hidden rounded-2xl bg-[#F4F4F2] text-left shadow-[inset_0_0_0_1px_rgba(17,17,17,0.04)] transition aria-pressed:shadow-[inset_0_0_0_2px_var(--ink)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo} alt="" className="aspect-square w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-105" loading="lazy" />
            <span className="block truncate px-2 pb-2 text-[12px] font-semibold">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Also({ kit, product, items, onPick, onCollect }: { kit: BrandKit; product: NwProduct; items: Item[]; onPick: (id: string) => void; onCollect: () => void }) {
  const also = ALSO.filter((id) => id !== product.id)
    .slice(0, 4)
    .flatMap((id) => nwProduct(id) ?? []);
  return (
    <div className="flex h-full flex-col gap-4 min-[901px]:max-[1400px]:gap-2">
      <p className="nw-kicker text-[var(--mute)]">Skapa även</p>
      <div className="flex flex-1 flex-col gap-4 min-[901px]:max-[1400px]:flex-row min-[901px]:max-[1400px]:items-end">
        <ul className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] min-[1401px]:grid min-[1401px]:grid-cols-2 min-[1401px]:overflow-visible">
          {also.map((p) => {
            const saved = items.some((i) => i.id === p.id);
            return (
              <li key={p.id} className="w-[120px] shrink-0 min-[901px]:w-[76px] min-[1401px]:w-auto">
                <button type="button" onClick={() => onPick(p.id)} className="group block w-full overflow-hidden rounded-2xl bg-[#F4F4F2] text-left transition hover:shadow-[0_10px_24px_-14px_rgba(17,17,17,0.45)]" aria-label={`Designa ${p.name}`}>
                  <ProductMock product={p} logo={kit.logo ?? PLACEHOLDER.light} logoDark={kit.logoDark ?? PLACEHOLDER.dark} className="transition duration-500 group-hover:scale-105" />
                  <span className="flex items-center gap-1 bg-white px-2.5 py-2 text-[12.5px] font-semibold min-[901px]:max-[1400px]:px-1.5 min-[901px]:max-[1400px]:py-1 min-[901px]:max-[1400px]:text-[11.5px]">
                    <span aria-hidden className="text-[var(--mute)]">
                      {saved ? "✓" : "+"}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto grid gap-2 min-[901px]:max-[1400px]:ml-auto min-[901px]:max-[1400px]:w-[220px] min-[901px]:max-[1400px]:shrink-0">
          <p className="text-[12.5px] leading-snug text-[var(--mute)]">{items.length ? `${items.length} ${items.length === 1 ? "produkt" : "produkter"} i kollektionen.` : "Samma logga, färger och placering på hela sortimentet."}</p>
          <button type="button" onClick={onCollect} className="flex h-12 items-center justify-between rounded-2xl bg-[var(--shop)] px-4 text-[14px] font-semibold text-[var(--shop-on)] transition hover:opacity-90 active:scale-[0.98]">
            Skapa kollektion <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Förstasidans studio: designmotorn med varumärket, kollektionen, klubbshopen och produktionen. */
export function StudioHome() {
  const [kit, setKit] = useState<BrandKit>(DEFAULT_KIT);
  const [items, setItems] = useState<Item[]>([]);
  const [productId, setProductId] = useState(START);
  const [tab, setTab] = useState<Tab>("design");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as {
        kit?: unknown;
        items?: unknown;
        productId?: unknown;
        tab?: unknown;
      } | null;
      /* eslint-disable react-hooks/set-state-in-effect -- localStorage går bara att läsa efter mount */
      setKit(readKit(saved?.kit));
      setItems(readItems(saved?.items));
      if (typeof saved?.productId === "string" && nwProduct(saved.productId)) setProductId(saved.productId);
      if (typeof saved?.tab === "string" && isTab(saved.tab)) setTab(saved.tab);
    } catch {}
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          kit,
          items: items.map((i) => ({
            id: i.id,
            color: i.color,
            design: i.design,
          })),
          productId,
          tab,
        }),
      );
    } catch {}
  }, [loaded, kit, items, productId, tab]);

  const product = nwProduct(productId) ?? NW_CATALOG[0];
  const item = items.find((i) => i.id === product.id);
  const accent = kitAccent(kit);

  const pick = (id: string) => {
    setProductId(id);
    setTab("design");
  };
  const save = ({ design, color, preview }: StudioResult) => setItems((list) => [...list.filter((i) => i.id !== product.id), { id: product.id, color, design, preview }]);
  const collect = () => {
    setItems((list) => [
      ...list,
      ...[product.id, ...ALSO.filter((id) => id !== product.id).slice(0, 4)]
        .filter((id) => !list.some((i) => i.id === id))
        .flatMap((id) => {
          const p = nwProduct(id);
          return p ? [{ id, color: p.garmentHex, design: defaultDesign(p) }] : [];
        }),
    ]);
    setTab("kollektion");
  };

  return (
    <div style={{ "--shop": accent, "--shop-on": "#FFFFFF" } as React.CSSProperties} className="flex flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:h-[min(940px,calc(100svh-48px))] min-[900px]:rounded-[30px]">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[rgba(17,17,17,0.07)] px-4 py-3 min-[900px]:flex-nowrap min-[900px]:gap-6 min-[900px]:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[13px] font-semibold tracking-[0.18em]">NEXT WAVE</span>
          <span className="hidden text-[14px] font-medium text-[#6F6B63] min-[900px]:inline">Studio</span>
          <span className="min-[900px]:hidden">
            <HubSwitch active="studio" bar />
          </span>
        </div>
        <nav role="tablist" aria-label="Studio" className="order-last -mx-1 flex basis-full gap-1 overflow-x-auto [scrollbar-width:none] min-[900px]:order-none min-[900px]:mx-auto min-[900px]:basis-auto">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`nw-tab-${t.id}`}
              aria-controls="nw-tabpanel"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
                if (to === null) return;
                e.preventDefault();
                const next = TABS[(to + TABS.length) % TABS.length];
                setTab(next.id);
                document.getElementById(`nw-tab-${next.id}`)?.focus();
              }}
              className="h-9 shrink-0 rounded-full px-4 text-[14px] font-medium text-[#6F6B63] transition hover:text-[#111] aria-selected:bg-[#111] aria-selected:text-white"
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setTab("design")}
          className="ml-auto flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.3)] min-[900px]:ml-0"
          aria-label={`Varumärke: ${kit.name}`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#F2F2EF] p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={kit.logo ?? PLACEHOLDER.light} alt="" className="max-h-full max-w-full object-contain" />
          </span>
          <span className="max-w-[160px] truncate text-[13.5px] font-semibold">{kit.name}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 min-[900px]:flex-row min-[900px]:gap-0 min-[900px]:p-0 min-[900px]:pl-1.5">
        <div className="hidden shrink-0 py-3 min-[900px]:flex">
          <HubSwitch active="studio" />
        </div>
        <div id="nw-tabpanel" role="tabpanel" aria-labelledby={`nw-tab-${tab}`} className="min-h-0 min-w-0 flex-1">
          {tab === "design" ? (
            <DesignStudio
              key={product.id}
              product={product}
              initial={item?.design ?? defaultDesign(product)}
              color={item?.color ?? product.garmentHex}
              art={{
                light: kit.logo ?? PLACEHOLDER.light,
                dark: kit.logoDark ?? PLACEHOLDER.dark,
                label: kit.logo ? kit.name : "Din logga",
              }}
              brandColor={accent}
              saveLabel={item ? "Uppdatera i kollektionen" : "Lägg i kollektionen"}
              onSave={save}
              picker={<Picker current={product.id} onPick={pick} />}
              brand={<BrandTools kit={kit} onChange={setKit} />}
              aside={<Also kit={kit} product={product} items={items} onPick={pick} onCollect={collect} />}
              fill
            />
          ) : (
            <div className="min-[900px]:h-full min-[900px]:overflow-y-auto">
              {tab === "kollektion" ? (
                <CollectionTab kit={kit} items={items} onEdit={pick} onRemove={(id) => setItems((list) => list.filter((i) => i.id !== id))} onStart={collect} />
              ) : tab === "klubbshop" ? (
                <ShopTab kit={kit} items={items} onStart={collect} />
              ) : (
                <ProductionTab items={items} onStart={collect} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
