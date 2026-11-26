"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShopProductView } from "@/app/api/v1/craft/products/view";
import { Crest, fmtKr, fmtN } from "@/components/newwave/craft/parts";
import { SearchBox } from "@/components/newwave/craft/SearchBox";
import type { ClubProductStatus } from "@/lib/poc/types";
import { Chevron, type ProductOption, type SavedDesign } from "./CollectionBuilder";
import { VariantRows } from "./VariantRows";
import { STANDARD_VARIANT, type VariantChoice } from "./variants";

/**
 * Crafts vy över en klubbs Intersport-shop: alla klubbprodukter från alla designer, med bild, titel, pris och status.
 * Craft tar bort en produkt ur shoppen (den finns kvar för ordrarna), lägger tillbaka den, lägger till en ny – design,
 * variant, artikel och färg, publicerad till just den klubben – och ändrar priset.
 */

/** En rad ur klubbregistret: id, namn, län, kommun, sport, färger med komma emellan, märkets version och grundandeåret. */
type Row = [string, string, string, string, string, string, string, string?];
type Club = { id: string; name: string; municipality: string; sport: string; colors: string[]; logo: string; founded?: number; text: string };
type PreviewItem = { title: string; priceSek: number; mockupUrl: string; label: string; color?: { name: string } };

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const toClub = ([id, name, , municipality, sport, colors, v, founded]: Row): Club => ({
  id,
  name,
  municipality,
  sport,
  colors: colors.split(","),
  logo: `/api/v1/newwave/registry/${id}/logo.png?v=${v}`,
  founded: Number(founded) || undefined,
  text: fold(`${name} ${municipality} ${sport}`),
});

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
  return json;
}

const small = (url: string) => url.replace("&s=800", "&s=480");
const STATUS_LABEL: Record<ClubProductStatus, string> = { publicerad: "I shoppen", borttagen: "Borttagen", utkast: "Utkast" };
const ORDER: Record<ClubProductStatus, number> = { publicerad: 0, utkast: 1, borttagen: 2 };
const field = "h-9 w-full appearance-none truncate rounded-full bg-[var(--nw-soft)] pl-3.5 pr-8 text-[13px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]";

export function ShopEditor({ initialClub, designs, products }: { initialClub: string; designs: SavedDesign[]; products: ProductOption[] }) {
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [q, setQ] = useState("");
  const [clubId, setClubId] = useState(initialClub);
  const [items, setItems] = useState<ShopProductView[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    fetch("/api/v1/craft/clubs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: { clubs: Row[] }) => live && setClubs(json.clubs.map(toClub)))
      .catch(() => live && setClubs([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    let live = true;
    fetch(`/api/v1/craft/products?clubId=${encodeURIComponent(clubId)}`)
      .then(async (r) => {
        const json = (await r.json().catch(() => ({}))) as { products?: ShopProductView[]; error?: string };
        if (!r.ok || !json.products) throw new Error(json.error ?? "Kunde inte läsa klubbens produkter.");
        return json.products;
      })
      .then((list) => live && setItems(list))
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : "Kunde inte läsa klubbens produkter."));
    return () => {
      live = false;
    };
  }, [clubId]);

  const club = useMemo(() => clubs?.find((c) => c.id === clubId), [clubs, clubId]);
  const pick = (id: string) => {
    setClubId(id);
    setItems(null);
    setLoadError("");
    setMessage("");
    // Bara adressen: klubbens produkter hämtas här, så sidan behöver inte ritas om på servern.
    window.history.replaceState(null, "", id ? `/newwave/craft/shoppar?klubb=${encodeURIComponent(id)}` : "/newwave/craft/shoppar");
  };
  const replace = (p: ShopProductView) => setItems((list) => (list?.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...(list ?? [])]));

  const patch = async (p: ShopProductView, body: { status?: "publicerad" | "borttagen"; priceSek?: number | null }, done: string) => {
    setBusy(p.id);
    setMessage("");
    try {
      const res = await call<{ product: ShopProductView }>(`/api/v1/craft/products/${p.id}`, "PATCH", body);
      replace(res.product);
      setPrices((m) => {
        const { [p.id]: _drop, ...rest } = m;
        void _drop;
        return rest;
      });
      setMessage(done);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kunde inte ändra produkten.");
    } finally {
      setBusy(null);
    }
  };
  const savePrice = (p: ShopProductView) => {
    const raw = prices[p.id];
    if (raw === undefined) return;
    const n = Math.round(Number(raw.replace(/\s/g, "").replace(",", ".")));
    if (!Number.isFinite(n) || n <= 0) return setMessage("Priset ska vara ett belopp i hela kronor.");
    if (n === p.priceSek) return;
    void patch(p, { priceSek: n }, `${p.title} kostar nu ${fmtKr(n)}.`);
  };

  if (!clubId || (clubs && !club && clubs.length)) {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hits = (clubs ?? []).filter((c) => words.every((w) => c.text.includes(w))).slice(0, 24);
    return (
      <div className="mt-6">
        <SearchBox value={q} onChange={setQ} placeholder="Sök klubb, ort eller sport" size="md" />
        {clubId && clubs && !club ? <p className="mt-3 text-[13.5px] text-[#9B1C1C]">Klubben finns inte i klubbregistret.</p> : null}
        {!clubs ? (
          <p className="mt-4 text-[13.5px] text-[var(--nw-muted)]">Läser klubbregistret…</p>
        ) : words.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {hits.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c.id)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--nw-line)] p-2.5 text-left transition-colors hover:border-[#bdbdb8]">
                  <Crest name={c.name} logo={c.logo} colors={[c.colors[0], c.colors[1] ?? "#FFFFFF"]} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[var(--nw-ink)]">{c.name}</span>
                    <span className="block truncate text-[12px] text-[var(--nw-muted)]">{[c.municipality, c.sport].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
            {!hits.length ? <li className="text-[14px] text-[var(--nw-muted)]">Inga klubbar matchar.</li> : null}
          </ul>
        ) : (
          <p className="mt-4 text-[13.5px] text-[var(--nw-muted)]">Sök bland {fmtN(clubs.length)} klubbar i klubbregistret.</p>
        )}
      </div>
    );
  }

  const sorted = [...(items ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.designName.localeCompare(b.designName, "sv") || a.title.localeCompare(b.title, "sv"));
  const live = (items ?? []).filter((p) => p.status === "publicerad").length;
  const removed = (items ?? []).filter((p) => p.status === "borttagen").length;

  return (
    <div className="mt-6 flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-[var(--nw-line)] p-3 sm:p-4">
        <Crest name={club?.name ?? clubId} logo={club?.logo} colors={[club?.colors[0] ?? "#111111", club?.colors[1] ?? "#FFFFFF"]} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-[var(--nw-ink)]">{club?.name ?? clubId}</p>
          <p className="truncate text-[12.5px] text-[var(--nw-muted)]">
            {[club?.municipality, club?.sport].filter(Boolean).join(" · ")}
            {items ? ` · ${fmtN(live)} i shoppen${removed ? `, ${fmtN(removed)} borttagna` : ""}` : ""}
          </p>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <a href={`/intersport/${clubId}`} target="_blank" rel="noreferrer" className="nw-btn nw-btn-ghost h-9 px-3.5 text-[13px]">
            Öppna shoppen ↗
          </a>
          <button type="button" onClick={() => pick("")} className="nw-hit text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
            Byt klubb
          </button>
        </div>
      </div>

      {message ? (
        <p className="-mt-3 text-[13.5px] text-[var(--nw-ink)]" role="status">
          {message}
        </p>
      ) : null}

      <AddProduct
        clubId={clubId}
        designs={designs}
        products={products}
        sample={club ? { name: club.name, municipality: club.municipality, sport: club.sport, founded: club.founded } : undefined}
        onAdded={(p, existed) => {
          replace(p);
          setMessage(existed === "publicerad" ? `${p.title} fanns redan i shoppen och har uppdaterats.` : existed ? `${p.title} är tillbaka i shoppen.` : `${p.title} är tillagd i shoppen.`);
        }}
      />

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Produkterna</h2>
        {loadError ? <p className="mt-3 text-[13.5px] text-[#9B1C1C]">{loadError}</p> : null}
        {!items && !loadError ? <p className="mt-3 text-[13.5px] text-[var(--nw-muted)]">Läser shoppen…</p> : null}
        {items && !items.length ? <p className="mt-3 rounded-2xl bg-[var(--nw-soft)] p-4 text-[13.5px] text-[var(--nw-muted)]">Klubben har inga produkter från Craft än. Lägg till en ovan, eller publicera en kollektion.</p> : null}
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((p) => {
            const gone = p.status !== "publicerad";
            const price = prices[p.id] ?? String(p.priceSek);
            return (
              <li key={p.id} className={`flex flex-col gap-3 rounded-[20px] border border-[var(--nw-line)] p-2.5 sm:flex-row sm:items-center ${gone ? "bg-[var(--nw-soft)]" : ""}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--nw-soft)] ${gone ? "opacity-50" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- mockup ritad av servern */}
                    {p.mockupUrl ? <img src={small(p.mockupUrl)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-[var(--nw-ink)]">{p.title}</span>
                    <span className="block truncate text-[12px] text-[var(--nw-muted)]">
                      {[p.designName, p.color?.name, p.orders ? `${fmtN(p.orders)} ${p.orders === 1 ? "order" : "ordrar"}` : ""].filter(Boolean).join(" · ")}
                    </span>
                    <span className={`mt-1 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${gone ? "bg-white text-[var(--nw-muted)]" : "bg-[var(--nw-ink)] text-white"}`}>{STATUS_LABEL[p.status]}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <label className="flex items-center gap-1.5">
                    <span className="sr-only">Pris för {p.title}</span>
                    <input
                      value={price}
                      inputMode="numeric"
                      onChange={(e) => setPrices((m) => ({ ...m, [p.id]: e.target.value }))}
                      onBlur={() => savePrice(p)}
                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                      disabled={busy === p.id}
                      className="h-9 w-[84px] rounded-full border border-[var(--nw-line)] bg-white px-3 text-right text-[13.5px] tabular-nums text-[var(--nw-ink)] outline-none focus:border-[var(--nw-ink)]"
                    />
                    <span className="text-[13px] text-[var(--nw-muted)]">kr</span>
                  </label>
                  {p.customPrice && p.catalogPriceSek ? (
                    <button type="button" disabled={busy === p.id} onClick={() => patch(p, { priceSek: null }, `${p.title} kostar nu katalogpriset, ${fmtKr(p.catalogPriceSek!)}.`)} className="nw-hit text-[12px] text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
                      Katalogpris {fmtKr(p.catalogPriceSek)}
                    </button>
                  ) : null}
                  {gone ? (
                    <button type="button" disabled={busy === p.id} onClick={() => patch(p, { status: "publicerad" }, `${p.title} är tillbaka i shoppen.`)} className="nw-btn h-9 px-3.5 text-[13px] disabled:opacity-50">
                      {p.status === "utkast" ? "Publicera" : "Lägg tillbaka"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => patch(p, { status: "borttagen" }, `${p.title} är borttagen ur shoppen${p.orders ? ` – ${p.orders === 1 ? "ordern" : `de ${fmtN(p.orders)} ordrarna`} med den påverkas inte` : ""}.`)}
                      className="nw-btn nw-btn-ghost h-9 px-3.5 text-[13px] disabled:opacity-50"
                    >
                      Ta bort ur shoppen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** Lägg till en produkt i klubbens shop: design, variant, artikel och färg – förhandsvisad och publicerad till klubben. */
function AddProduct({
  clubId,
  designs,
  products,
  sample,
  onAdded,
}: {
  clubId: string;
  designs: SavedDesign[];
  products: ProductOption[];
  sample?: { name: string; municipality?: string; sport?: string; founded?: number };
  onAdded: (p: ShopProductView, existed: ClubProductStatus | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [variant, setVariant] = useState<VariantChoice[]>([STANDARD_VARIANT]);
  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const [color, setColor] = useState("auto");
  const [preview, setPreview] = useState<{ key: string; item: PreviewItem | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const design = designs.find((d) => d.id === designId);
  const product = products.find((p) => p.sku === sku);
  const wordmark = design?.type === "ordmall";
  const body = design && product ? { clubId, designId, sku, color: product.kind === "plagg" ? color : undefined, variant: wordmark ? variant[0] : undefined } : null;
  const key = open && body ? JSON.stringify(body) : "";

  useEffect(() => {
    if (!key) return;
    const b = JSON.parse(key) as NonNullable<typeof body>;
    let live = true;
    const t = setTimeout(() => {
      call<{ items: PreviewItem[] }>("/api/v1/craft/preview", "POST", {
        designId: b.designId,
        clubIds: [b.clubId],
        skus: [b.sku],
        ...(b.color && b.color !== "auto" ? { colors: { [b.sku]: b.color } } : {}),
        ...(b.variant ? { variants: { [b.clubId]: [b.variant] } } : {}),
      })
        .then((r) => live && setPreview({ key, item: r.items[0] ?? null }))
        .catch(() => live && setPreview({ key, item: null }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);

  const add = async () => {
    if (!body) return;
    setSaving(true);
    setError("");
    try {
      const res = await call<{ product: ShopProductView; existed: ClubProductStatus | null }>("/api/v1/craft/products", "POST", body);
      onAdded(res.product, res.existed);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte lägga till produkten.");
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} disabled={!designs.length} className="nw-btn disabled:opacity-40">
          Lägg till en produkt
        </button>
        {!designs.length ? <p className="mt-2 text-[12.5px] text-[var(--nw-muted)]">Gör en design i Klubbkollektion först.</p> : null}
      </div>
    );

  const item = preview?.key === key ? preview.item : undefined;
  return (
    <section className="rounded-[22px] bg-[var(--nw-soft)] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--nw-ink)]">Lägg till en produkt</h2>
        <button type="button" onClick={() => setOpen(false)} className="nw-hit text-[13px] font-medium text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
          Stäng
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        <div className="grid aspect-square w-full shrink-0 place-items-center overflow-hidden rounded-2xl bg-white sm:w-[200px]">
          {item?.mockupUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- mockup ritad av servern */
            <img src={small(item.mockupUrl)} alt={item.title} className="h-full w-full object-contain" />
          ) : (
            <span className="px-4 text-center text-[12.5px] text-[var(--nw-muted)]">{item === null ? "Ingen förhandsbild" : "Ritar…"}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="relative">
              <span className="mb-1 block px-1 text-[12px] text-[var(--nw-muted)]">Design</span>
              <span className="relative block">
                <select value={designId} onChange={(e) => setDesignId(e.target.value)} className={field}>
                  {designs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.type === "fil" ? "egen fil" : "ordmall"})
                    </option>
                  ))}
                </select>
                <Chevron />
              </span>
            </label>
            <label className="relative">
              <span className="mb-1 block px-1 text-[12px] text-[var(--nw-muted)]">Artikel</span>
              <span className="relative block">
                <select
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value);
                    setColor("auto");
                  }}
                  className={field}
                >
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name} · {p.priceSek} kr
                    </option>
                  ))}
                </select>
                <Chevron />
              </span>
            </label>
          </div>
          {product?.kind === "plagg" ? (
            <div>
              <span className="mb-1 block px-1 text-[12px] text-[var(--nw-muted)]">Färg</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Plaggets färg">
                {[{ value: "auto", name: "Automatiskt" }, ...(product.colorOptions ?? []).map((c) => ({ value: c.hex, name: c.name, hex: c.hex })), ...(product.clubColor ? [{ value: "klubb", name: "Klubbens mörkaste färg" }] : [])].map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    aria-pressed={color === c.value}
                    className={`nw-chip inline-flex h-8 items-center gap-1.5 px-3 ${color === c.value ? "border-[var(--nw-ink)] bg-[var(--nw-ink)] text-white" : "bg-white hover:border-[var(--nw-ink)]"}`}
                  >
                    {"hex" in c ? <span className="h-3 w-3 rounded-full" style={{ background: c.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)" }} aria-hidden /> : null}
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {wordmark ? (
            <div>
              <span className="block px-1 text-[12px] text-[var(--nw-muted)]">Texterna</span>
              <VariantRows value={variant} onChange={setVariant} sample={sample} max={1} />
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <button type="button" disabled={!body || saving} onClick={add} className="nw-btn disabled:opacity-40">
              {saving ? "Lägger till…" : "Lägg till i shoppen"}
            </button>
            {item ? (
              <span className="min-w-0 truncate text-[13px] text-[var(--nw-muted)]">
                {item.title} · {fmtKr(item.priceSek)}
                {item.color ? ` · ${item.color.name}` : ""}
              </span>
            ) : null}
          </div>
          {error ? <p className="text-[13px] text-[#9B1C1C]">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
