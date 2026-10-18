"use client";

import { useEffect, useState } from "react";
import { type BrandKit, DEFAULT_KIT, kitAccent, readKit } from "@/lib/newwave/brandKit";
import { CATEGORIES, NW_CATALOG, type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { defaultDesign, sanitizeDesign } from "@/lib/newwave/marking";
import { type OccasionId, isOccasion, occasion as occasionOf } from "@/lib/newwave/occasions";
import { HubSwitch } from "../HubSwitch";
import { LogoMark } from "../Logo";
import { PLACEHOLDER } from "../shop/cart";
import { ProductMock } from "../shop/ProductMock";
import { DesignStudio, type StudioResult } from "../studio/DesignStudio";
import { BrandTools } from "./BrandTools";
import { ClubPreview, ClubsTab, PublishTab, QuoteTab } from "./Destinations";
import { type Role, clubKit, storageKey } from "./roles";
import { CollectionTab, type Item, ProductionTab, ShopTab } from "./Tabs";

/** Fliken efter kollektionen: dit designen tar vägen för den som designar. */
const DESTINATION: Record<Role["kind"], { id: string; label: string; next: string }> = {
  studio: { id: "klubbshop", label: "Klubbshop", next: "Se klubbshopen" },
  klubb: { id: "butik", label: "Butiken", next: "Lägg ut i butiken" },
  craft: { id: "klubbar", label: "Klubbarna", next: "Skicka till klubbarna" },
  shop: { id: "offert", label: "Offert", next: "Gör en offert" },
};

/** Det som visas under "Skapa även": samma tryck på fler produkter. */
const ALSO = ["p004", "p012", "p009", "p020", "p001"];
const START = "p001";

function readItems(raw: unknown, allowed: (id: string) => boolean): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = r && typeof r.id === "string" && allowed(r.id) ? nwProduct(r.id) : undefined;
    const design = p ? sanitizeDesign(p, r.design) : undefined;
    return p && design ? [{ id: p.id, color: typeof r.color === "string" ? r.color : p.garmentHex, design, sent: r.sent === true }] : [];
  });
}

function Picker({ products, current, onPick }: { products: NwProduct[]; current: string; onPick: (id: string) => void }) {
  const cats = CATEGORIES.filter((c) => products.some((p) => p.category === c));
  const [cat, setCat] = useState(nwProduct(current)?.category ?? cats[0]);
  return (
    <div>
      <p className="drawer-label">Produkt</p>
      <div className="cz-chips mb-3" role="group" aria-label="Kategori">
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={c === cat} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {products
          .filter((p) => p.category === cat)
          .map((p) => (
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

function Also({ kit, also, items, collectLabel, onPick, onCollect }: { kit: BrandKit; also: NwProduct[]; items: Item[]; collectLabel: string; onPick: (id: string) => void; onCollect: () => void }) {
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
                  <ProductMock product={p} logo={kit.logo ?? PLACEHOLDER.light} logoDark={kit.logoDark ?? (kit.logo ? undefined : PLACEHOLDER.dark)} className="transition duration-500 group-hover:scale-105" />
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
            {collectLabel} <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Designmotorn med varumärket, kollektionen, rollens nästa steg och produktionen. På förstasidan med eget kort och
 * egen toppmeny; i en dashboard (`embedded`) bara flikarna, eftersom dashboardens skal redan har toppraden.
 */
export function Workspace({ role, embedded = false }: { role: Role; embedded?: boolean }) {
  const allowed = role.kind === "craft" || role.kind === "shop" ? new Set(role.products) : null;
  const products = allowed ? NW_CATALOG.filter((p) => allowed.has(p.id)) : NW_CATALOG;
  const can = (id: string) => !allowed || allowed.has(id);
  const start = can(START) ? START : products[0].id;
  const base = role.kind === "klubb" || role.kind === "shop" ? role.kit : DEFAULT_KIT;
  const dest = DESTINATION[role.kind];
  const tabs = [
    { id: "design", label: "Design" },
    { id: "kollektion", label: "Kollektion" },
    { id: dest.id, label: dest.label },
    { id: "produktion", label: "Produktion" },
  ];
  const key = storageKey(role);

  const [kit, setKit] = useState<BrandKit>(base);
  const [previewClub, setPreviewClub] = useState(role.kind === "craft" ? role.clubs[0]?.id : undefined);
  const [items, setItems] = useState<Item[]>([]);
  const [productId, setProductId] = useState(start);
  const [tab, setTab] = useState("design");
  const [occasion, setOccasion] = useState<OccasionId | null>(null);
  const [loaded, setLoaded] = useState(false);
  const occasions = role.kind === "shop" ? role.occasions : [];

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { kit?: unknown; items?: unknown; productId?: unknown; tab?: unknown; club?: unknown; occasion?: unknown } | null;
      /* eslint-disable react-hooks/set-state-in-effect -- localStorage går bara att läsa efter mount */
      const stored = readKit(saved?.kit, base);
      setKit(base.source.kind === "profil" && (stored.source.kind === "profil" || stored.source.kind === "standard") ? base : stored);
      setItems(readItems(saved?.items, can));
      if (typeof saved?.productId === "string" && can(saved.productId) && nwProduct(saved.productId)) setProductId(saved.productId);
      if (typeof saved?.tab === "string" && tabs.some((t) => t.id === saved.tab)) setTab(saved.tab);
      if (role.kind === "craft" && typeof saved?.club === "string" && role.clubs.some((c) => c.id === saved.club)) setPreviewClub(saved.club);
      if (isOccasion(saved?.occasion) && occasions.includes(saved.occasion)) setOccasion(saved.occasion);
    } catch {}
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- läses en gång när studion monteras
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify({ kit, items: items.map(({ id, color, design, sent }) => ({ id, color, design, sent })), productId, tab, club: previewClub, occasion }));
    } catch {}
  }, [loaded, key, kit, items, productId, tab, previewClub, occasion]);

  const club = role.kind === "craft" ? (role.clubs.find((c) => c.id === previewClub) ?? role.clubs[0]) : undefined;
  const design = club ? clubKit(club) : kit;
  const product = nwProduct(productId) ?? products[0];
  const item = items.find((i) => i.id === product.id);
  const accent = role.kind === "craft" ? "#1B1A17" : kitAccent(kit);
  const also = ALSO.filter((id) => id !== product.id && can(id))
    .slice(0, 4)
    .flatMap((id) => nwProduct(id) ?? []);

  const pick = (id: string) => {
    setProductId(id);
    setTab("design");
  };
  const save = ({ design: d, color, preview }: StudioResult) => setItems((list) => [...list.filter((i) => i.id !== product.id), { id: product.id, color, design: d, preview }]);
  const collect = () => {
    setItems((list) => [
      ...list,
      ...[product.id, ...also.map((p) => p.id)]
        .filter((id) => !list.some((i) => i.id === id))
        .flatMap((id) => {
          const p = nwProduct(id);
          return p ? [{ id, color: p.garmentHex, design: defaultDesign(p) }] : [];
        }),
    ]);
    setOccasion(null);
    setTab("kollektion");
  };
  /** Återförsäljaren bygger kollektionen för ett tillfälle, som kunderna gör i butikens eventverktyg. */
  const fromOccasion = (id: OccasionId) => {
    setItems((list) =>
      occasionOf(id)!.products.flatMap((pid) => {
        const p = can(pid) ? nwProduct(pid) : undefined;
        return p ? [list.find((i) => i.id === pid) ?? { id: pid, color: p.garmentHex, design: defaultDesign(p) }] : [];
      }),
    );
    setOccasion(id);
    setTab("kollektion");
  };
  const begin = occasions.length ? () => setTab("kollektion") : collect;
  const markSent = (ids: string[]) => setItems((list) => list.map((i) => (ids.includes(i.id) ? { ...i, sent: true } : i)));

  const brand = club && role.kind === "craft" ? <ClubPreview clubs={role.clubs} current={club.id} onPick={setPreviewClub} /> : <BrandTools kit={kit} home={base.source.kind === "profil" ? base : undefined} onChange={setKit} />;

  const panel =
    tab === "design" ? (
      <DesignStudio
        key={product.id}
        product={product}
        initial={item?.design ?? defaultDesign(product)}
        color={item?.color ?? product.garmentHex}
        art={{ light: design.logo ?? PLACEHOLDER.light, dark: design.logoDark ?? (design.logo ? design.logo : PLACEHOLDER.dark), label: club ? "klubbens logga" : design.logo ? design.name : "Din logga" }}
        brandColor={accent}
        saveLabel={item ? "Uppdatera i kollektionen" : "Lägg i kollektionen"}
        onSave={save}
        picker={<Picker products={products} current={product.id} onPick={pick} />}
        brand={brand}
        aside={<Also kit={design} also={also} items={items} collectLabel={occasions.length ? "Skapa kollektion för ett event" : "Skapa kollektion"} onPick={pick} onCollect={begin} />}
        fill
      />
    ) : (
      <div className="min-[900px]:h-full min-[900px]:overflow-y-auto">
        {tab === "kollektion" ? (
          <CollectionTab
            kit={design}
            items={items}
            onEdit={pick}
            onRemove={(id) => setItems((list) => list.filter((i) => i.id !== id))}
            onStart={collect}
            next={{ label: dest.next, go: () => setTab(dest.id) }}
            occasions={role.kind === "shop" && occasions.length ? { offered: occasions, current: occasion, onPick: fromOccasion, slug: role.slug } : undefined}
          />
        ) : tab === "produktion" ? (
          <ProductionTab items={items} onStart={begin} />
        ) : role.kind === "klubb" ? (
          <PublishTab clubId={role.clubId} kit={kit} items={items} onStart={begin} onSent={markSent} />
        ) : role.kind === "craft" ? (
          <ClubsTab clubs={role.clubs} items={items} onStart={begin} onSent={markSent} />
        ) : role.kind === "shop" ? (
          <QuoteTab slug={role.slug} markup={role.markup} kit={kit} items={items} onStart={begin} />
        ) : (
          <ShopTab kit={kit} items={items} onStart={begin} />
        )}
      </div>
    );

  const tablist = (
    <nav role="tablist" aria-label="Studio" className={`-mx-1 flex gap-1 overflow-x-auto [scrollbar-width:none] ${embedded ? "" : "order-last basis-full min-[900px]:order-none min-[900px]:mx-auto min-[900px]:basis-auto"}`}>
      {tabs.map((t, i) => (
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
            const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
            if (to === null) return;
            e.preventDefault();
            const next = tabs[(to + tabs.length) % tabs.length];
            setTab(next.id);
            document.getElementById(`nw-tab-${next.id}`)?.focus();
          }}
          className="h-9 shrink-0 rounded-full px-4 text-[14px] font-medium text-[#6F6B63] transition hover:text-[#111] aria-selected:bg-[#111] aria-selected:text-white"
        >
          {t.label}
          {t.id === "kollektion" && items.length ? <span className="ml-1.5 tabular-nums opacity-60">{items.length}</span> : null}
        </button>
      ))}
    </nav>
  );

  const badge = (
    <button type="button" onClick={() => setTab("design")} className="ml-auto flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.3)] min-[900px]:ml-0" aria-label={`Varumärke: ${design.name}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#F2F2EF] p-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={design.logo ?? PLACEHOLDER.light} alt="" className="max-h-full max-w-full object-contain" />
      </span>
      <span className="max-w-[160px] truncate text-[13.5px] font-semibold">{club ? `Förhandsvisas med ${club.name}` : design.name}</span>
    </button>
  );

  const vars = { "--shop": accent, "--shop-on": "#FFFFFF" } as React.CSSProperties;

  if (embedded)
    return (
      <div style={vars} className="flex flex-col min-[900px]:h-[calc(100svh-113px)]">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[rgba(17,17,17,0.07)] px-3 py-2 min-[900px]:flex-nowrap min-[900px]:px-4">
          {tablist}
          <div className="ml-auto min-w-0">{badge}</div>
        </div>
        <div id="nw-tabpanel" role="tabpanel" aria-labelledby={`nw-tab-${tab}`} className="min-h-0 min-w-0 flex-1 p-2 min-[900px]:p-0">
          {panel}
        </div>
      </div>
    );

  return (
    <div style={vars} className="flex flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:h-[min(940px,calc(100svh-48px))] min-[900px]:rounded-[30px]">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[rgba(17,17,17,0.07)] px-4 py-3 min-[900px]:flex-nowrap min-[900px]:gap-6 min-[900px]:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark size={28} />
          <span className="text-[13px] font-semibold tracking-[0.18em]">NEXT WAVE</span>
          <span className="hidden text-[14px] font-medium text-[#6F6B63] min-[900px]:inline">Studio</span>
          <span className="min-[900px]:hidden">
            <HubSwitch active="studio" bar />
          </span>
        </div>
        {tablist}
        {badge}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 min-[900px]:flex-row min-[900px]:gap-0 min-[900px]:p-0 min-[900px]:pl-1.5">
        <div className="hidden shrink-0 py-3 min-[900px]:flex">
          <HubSwitch active="studio" />
        </div>
        <div id="nw-tabpanel" role="tabpanel" aria-labelledby={`nw-tab-${tab}`} className="min-h-0 min-w-0 flex-1">
          {panel}
        </div>
      </div>
    </div>
  );
}
