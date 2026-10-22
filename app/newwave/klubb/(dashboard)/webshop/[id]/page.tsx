import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/newwave/ProductDetail";
import { ASA_IF as CLUB } from "@/lib/club";
import { listProducts } from "@/lib/intersport";
import { ASA_IF } from "@/lib/newwave/club";
import { NW_CATALOG, seasonLabel } from "@/lib/newwave/catalog";
import { splitTitle } from "@/lib/newwave/clubCollection";

export const dynamic = "force-dynamic";

const catalogId = (sku: string) => NW_CATALOG.find((c) => sku.startsWith(`CRAFT-POD-${c.id.toUpperCase()}-`))?.id;
const localPath = (url: string) => (url.startsWith("http") ? new URL(url).pathname : url);
const fmtDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", timeZone: "Europe/Stockholm" }).format(new Date(iso));

async function find(id: string) {
  const all = await listProducts(ASA_IF.id);
  return { all, p: all.find((x) => x.id === id) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { p } = await find((await params).id);
  return { title: p ? `${splitTitle(p.title).slogan} · ${splitTitle(p.title).name} · ${ASA_IF.name}` : `${ASA_IF.name} · Webshop` };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { all, p } = await find((await params).id);
  if (!p) notFound();
  const { slogan, name: product } = splitTitle(p.title);
  const cid = catalogId(p.sku);
  const item = NW_CATALOG.find((c) => c.id === cid);
  const same = all.filter((x) => x.id !== p.id && x.dropId === p.dropId);
  const more = (same.length ? same : all.filter((x) => x.id !== p.id)).slice(0, 4);

  const facts: [string, string][] = [
    ...(item
      ? ([
          ["Färg", item.garmentColor],
          ["Tryck", `${item.printArea.method}, upp till ${item.printArea.widthCm} × ${item.printArea.heightCm} cm`],
          ["Passar till", item.use.charAt(0).toUpperCase() + item.use.slice(1)],
          ["Säsong", seasonLabel(item.seasons).replace(/^./, (c) => c.toUpperCase())],
        ] as [string, string][])
      : []),
    ["Tillverkning", "Trycks på beställning – inget lager, inget svinn"],
    ["Kollektion", `${p.signal} · ute sedan ${fmtDate(p.publishedAt)}`],
    ["Artikelnummer", p.sku],
  ];

  return (
    <div className="nw-page">
      <Link href="/newwave/klubb/webshop" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        ← Webshop
      </Link>

      <div className="mt-4">
        <ProductDetail
          studio={
            cid
              ? {
                  productId: cid,
                  art: { light: localPath(p.printFileUrl), label: "klubbens motiv" },
                  initial: p.custom?.design,
                  color: p.custom?.color,
                  brandColor: CLUB.palette[0]?.hex,
                  target: { kind: "shop", clubId: ASA_IF.id, shopProductId: p.id },
                  wordmarkClub: ASA_IF,
                }
              : undefined
          }
          title={`${slogan} · ${product}`}
          images={p.images}
          printUrl={localPath(p.printFileUrl)}
          sizes={p.sizes}
          shopUrl={`${CLUB.intersportShopUrl}?drop=${p.dropId}`}
          header={
            <>
              <p className="text-[12.5px] text-[var(--nw-muted)]">
                {product} · {p.signal}
              </p>
              <h1 className="nw-club-heading mt-1 text-[28px] leading-[1.05] text-[var(--club)] [overflow-wrap:anywhere] sm:text-[34px]">{slogan}</h1>
              <p className="mt-2 text-[20px] font-semibold text-[var(--nw-ink)]">{p.priceSek} kr</p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--nw-muted)]">{p.description}</p>
              <p className="mt-2 text-[13px] font-medium text-[var(--nw-ink)]">Varje köp stöttar {ASA_IF.name}.</p>
            </>
          }
          details={
            <dl className="mt-6 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)] text-[13.5px]">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-2.5">
                  <dt className="text-[var(--nw-muted)]">{k}</dt>
                  <dd className="text-[var(--nw-ink)] [overflow-wrap:anywhere]">{v}</dd>
                </div>
              ))}
            </dl>
          }
        />
      </div>

      {more.length ? (
        <section className="mt-12">
          <h2 className="nw-club-heading text-[18px] text-[var(--club)]">{same.length ? "Fler i samma kollektion" : "Mer i butiken"}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {more.map((x) => {
              const n = splitTitle(x.title);
              const img = x.images.find((i) => i.kind === "foto") ?? x.images[0];
              return (
                <li key={x.id} className="min-w-0">
                  <Link href={`/newwave/klubb/webshop/${x.id}`} className="group block">
                    <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--nw-line)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.alt} className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]" />
                    </div>
                    <p className="mt-2 truncate text-[12px] text-[var(--nw-muted)]">{n.name}</p>
                    <p className="truncate text-[13.5px] font-medium text-[var(--nw-ink)]">{x.priceSek} kr</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
