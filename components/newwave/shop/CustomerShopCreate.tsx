"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { LogoResult } from "@/lib/logo";
import { type CustomerShop, DEMO_CUSTOMERS, type Reseller, SHOP_PACKS } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { CustomerStore } from "./CustomerStore";
import { ScaledPreview } from "./ScaledPreview";
import { RangePicker } from "./ShopBuilder";

type Company = { name: string; contact: string; email: string; logo: string; logoDark?: string; color: string };

const NEW = "ny";
const welcomeFor = (name: string) => `Här beställer ni ${name ? `${name}s` : "era"} kläder och profilprodukter till avtalat pris. Loggan ligger redan på allt, så det är bara att välja storlekar och antal.`.replace(/ss kläder/, "s kläder");

/** Ny kundbutik: välj kund, sortiment och pris och se butiken medan den byggs. */
export function CustomerShopCreate({ seller, taken }: { seller: Pick<Reseller, "name" | "slug" | "logo" | "texts" | "markup">; taken: string[] }) {
  const router = useRouter();
  const first = DEMO_CUSTOMERS.find((c) => !taken.includes(c.name)) ?? DEMO_CUSTOMERS[0];
  const [pick, setPick] = useState(first.name);
  const [company, setCompany] = useState<Company>(first);
  const [products, setProducts] = useState(SHOP_PACKS[0].products);
  const [markup, setMarkup] = useState(seller.markup);
  const [welcome, setWelcome] = useState(welcomeFor(first.name));
  const [busy, setBusy] = useState<"" | "logo" | "create">("");
  const [error, setError] = useState("");
  const [site, setSite] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const choose = (name: string) => {
    setPick(name);
    setError("");
    const c = DEMO_CUSTOMERS.find((x) => x.name === name);
    const next = c ?? { name: "", contact: "", email: "", logo: "", color: "#1D1D1F" };
    setCompany(next);
    setWelcome(welcomeFor(next.name));
  };

  const fetchLogo = async (body: Record<string, string>) => {
    setBusy("logo");
    setError("");
    try {
      const l = await call<LogoResult>("/api/v1/logo", body);
      setCompany((c) => ({ ...c, logo: l.light, logoDark: l.dark, color: /^#[0-9A-F]{6}$/i.test(l.color) ? l.color.toUpperCase() : c.color, name: c.name || l.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte hämta loggan");
    } finally {
      setBusy("");
    }
  };

  const create = async () => {
    setBusy("create");
    setError("");
    try {
      const { shop } = await call<{ shop: CustomerShop }>("/api/v1/newwave/customer-shops", {
        action: "create",
        company: { name: company.name, contact: company.contact, email: company.email },
        logo: company.logo,
        logoDark: company.logoDark,
        color: company.color,
        products,
        markup,
        welcome,
      });
      router.push(`/newwave/shop/butiken/kund/${shop.id}?ny=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa butiken");
      setBusy("");
    }
  };

  const ready = company.name.trim().length > 1 && company.logo && products.length > 0;
  const preview = { company, logo: company.logo || "/newwave/resellers/kunder/din-logga.png", logoDark: company.logo ? company.logoDark : "/newwave/resellers/kunder/din-logga-vit.png", color: company.color, products, markup, welcome };

  return (
    <div className="nw-page">
      <p className="text-[13px] text-[var(--nw-muted)]">
        <Link href="/newwave/shop/butiken" className="hover:text-[var(--nw-ink)]">
          ← Butiker
        </Link>
      </p>
      <h1 className="nw-club-heading mt-2 text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ny kundbutik</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">En stängd butik för en kund. Loggan ligger redan på produkterna, priset är avtalat och ordrarna går direkt till New Wave.</p>

      <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <section className="mb-7">
            <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Kund</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[...DEMO_CUSTOMERS.map((c) => ({ id: c.name, label: c.name, logo: c.logo })), { id: NEW, label: "Nytt företag", logo: "" }].map((c) => {
                const on = pick === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => choose(c.id)}
                      className={`flex h-full w-full flex-col items-center gap-2 rounded-[var(--nw-radius)] border-2 p-3 text-center transition-colors ${on ? "border-[var(--club)] bg-[var(--club-soft)]" : "border-[var(--nw-line)] hover:border-[var(--nw-ink)]"}`}
                    >
                      <span className="flex h-10 w-full items-center justify-center">
                        {c.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logo} alt="" className="max-h-full max-w-[80%] object-contain" />
                        ) : (
                          <span className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-[var(--nw-muted)] text-[18px] text-[var(--nw-muted)]">+</span>
                        )}
                      </span>
                      <span className="line-clamp-2 text-[12px] font-medium leading-tight text-[var(--nw-ink)]">{c.label}</span>
                      {taken.includes(c.id) ? <span className="text-[11px] text-[var(--nw-faint)]">Har redan en butik</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {pick === NEW ? (
              <div className="mt-4 grid gap-3 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
                <label className="block text-[13px] font-medium text-[var(--nw-ink)]">
                  Företag
                  <input value={company.name} maxLength={80} onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))} className="nw-input mt-1.5 w-full" />
                </label>
                <div>
                  <p className="text-[13px] font-medium text-[var(--nw-ink)]">Logga</p>
                  <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label="Välj kundens logga" onChange={async (e) => e.target.files?.[0] && fetchLogo({ dataUrl: await readDataUrl(e.target.files[0]), name: e.target.files[0].name.replace(/\.[^.]+$/, "") })} />
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <button type="button" disabled={Boolean(busy)} onClick={() => file.current?.click()} className="nw-btn nw-btn-ghost shrink-0 disabled:opacity-50">
                      {busy === "logo" ? "Hämtar…" : company.logo ? "Byt logga" : "Ladda upp"}
                    </button>
                    <form
                      className="flex min-w-0 flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (site.trim().length > 3) fetchLogo({ url: site.trim() });
                      }}
                    >
                      <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="eller hämta från kunden.se" aria-label="Kundens webbplats" className="nw-input min-w-0 flex-1" />
                      <button type="submit" disabled={Boolean(busy) || site.trim().length < 4} className="nw-btn nw-btn-ghost shrink-0 disabled:opacity-50">
                        Hämta
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <RangePicker
            products={products}
            markup={markup}
            onChange={(v) => {
              if (v.products) setProducts(v.products);
              if (v.markup !== undefined) setMarkup(v.markup);
            }}
          />

          <section className="mb-7">
            <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Välkomsttext och kontakt</h2>
            <p className="mt-0.5 text-[13.5px] text-[var(--nw-muted)]">Kontaktpersonen får länken och ser ordrarna.</p>
            <textarea value={welcome} rows={3} maxLength={400} onChange={(e) => setWelcome(e.target.value)} className="nw-input mt-3 w-full resize-y" aria-label="Välkomsttext" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px] font-medium text-[var(--nw-ink)]">
                Kontaktperson
                <input value={company.contact} maxLength={80} onChange={(e) => setCompany((c) => ({ ...c, contact: e.target.value }))} className="nw-input mt-1.5 w-full" />
              </label>
              <label className="block text-[13px] font-medium text-[var(--nw-ink)]">
                E-post
                <input type="email" value={company.email} maxLength={120} onChange={(e) => setCompany((c) => ({ ...c, email: e.target.value }))} className="nw-input mt-1.5 w-full" />
              </label>
            </div>
          </section>

          {error ? <p className="mb-4 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--nw-line)] pt-5">
            <button type="button" onClick={create} disabled={!ready || Boolean(busy)} className="nw-btn nw-club-btn disabled:opacity-50">
              {busy === "create" ? "Skapar…" : "Skapa kundbutiken"}
            </button>
            {!ready ? <span className="text-[12.5px] text-[var(--nw-faint)]">{!company.logo ? "Ladda upp kundens logga först." : !products.length ? "Välj minst en produkt." : "Skriv företagets namn."}</span> : null}
          </div>
        </div>
        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <ScaledPreview url={`/newwave/k/${company.name ? company.name.toLowerCase().replace(/[^a-z0-9åäö]+/g, "-") : "kund"}`}>
            <CustomerStore shop={preview} seller={seller} preview />
          </ScaledPreview>
        </div>
      </div>
    </div>
  );
}
