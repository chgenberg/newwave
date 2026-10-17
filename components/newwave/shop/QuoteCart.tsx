"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { designSummary } from "@/lib/newwave/marking";
import { priceLine, sek } from "@/lib/newwave/reseller";
import { call } from "./api";
import { useCart } from "./cart";
import { LineMock } from "./ProductMock";

const FIELDS = [
  { key: "name", label: "Företag", type: "text", auto: "organization", required: true },
  { key: "contact", label: "Kontaktperson", type: "text", auto: "name", required: true },
  { key: "email", label: "E-post", type: "email", auto: "email", required: true },
  { key: "phone", label: "Telefon", type: "tel", auto: "tel", required: false },
] as const;

export function QuoteCart({ slug, markup, shopName }: { slug: string; markup: number; shopName: string }) {
  const router = useRouter();
  const [cart, update] = useCart(slug);
  const [company, setCompany] = useState({ name: "", contact: "", email: "", phone: "" });
  const [needBy, setNeedBy] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tester = cart.tester;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- korgen läses ur webbläsaren efter mount
    if (tester) setCompany((c) => (c.name ? c : { name: tester.name, contact: tester.contact, email: tester.email, phone: "" }));
  }, [tester]);
  const priced = cart.lines.map((l) => ({ line: l, price: priceLine(l, markup) }));
  const total = priced.reduce((s, x) => s + (x.price?.total ?? 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const lines = cart.lines.map((l) => ({ productId: l.productId, sizes: l.sizes, design: l.design, color: l.color, logo: l.logo, logoDark: l.logoDark, preview: l.preview, proofs: l.proofs }));
      const r = await call<{ token: string }>("/api/v1/newwave/quotes", {
        slug,
        company: { ...company, phone: company.phone || undefined },
        needBy: needBy || undefined,
        message: message || undefined,
        lines,
      });
      update((c) => ({ ...c, lines: [] }));
      router.push(`/newwave/s/${slug}/offert/${r.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka");
      setBusy(false);
    }
  };

  if (!cart.lines.length) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-20 text-center sm:px-8">
        <h1 className="text-[30px] font-bold tracking-tight">Offertkorgen är tom</h1>
        <p className="mt-2 text-[15px] opacity-65">Välj en produkt, ladda upp loggan och lägg den här.</p>
        <Link href={`/newwave/s/${slug}#produkter`} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop-accent)] px-6 text-[15px] font-semibold text-[var(--shop-on-accent)]">
          Se produkterna
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
      <h1 className="text-[30px] font-bold tracking-tight sm:text-[38px]">Offertkorg</h1>
      <p className="mt-1 text-[14.5px] opacity-65">Kontrollera produkterna och skicka förfrågan. {shopName} återkommer med en offert.</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ul className="divide-y divide-[var(--shop-line)] border-y border-[var(--shop-line)]">
            {priced.map(({ line: l, price: pl }) => {
              const p = nwProduct(l.productId);
              if (!p) return null;
              return (
                <li key={l.key} className="flex gap-4 py-4">
                  <LineMock line={l} className="h-24 w-24 shrink-0 rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-[15px] font-semibold">{p.name}</p>
                      {pl ? <p className="shrink-0 text-[15px] font-semibold">{sek(pl.total)}</p> : null}
                    </div>
                    <p className="text-[12.5px] opacity-60">
                      {colorName(l.color)} · {designSummary(p, l.design)} · {Object.entries(l.sizes)
                        .filter(([, n]) => n > 0)
                        .map(([s, n]) => (s === "One size" ? `${n} st` : `${s} ${n}`))
                        .join(", ")}
                    </p>
                    <button type="button" onClick={() => update((c) => ({ ...c, lines: c.lines.filter((x) => x.key !== l.key) }))} className="mt-2 text-[12.5px] underline underline-offset-4 opacity-60 hover:opacity-100">
                      Ta bort
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-baseline justify-between">
            <p className="text-[14px] opacity-65">Preliminärt totalt exkl. moms</p>
            <p className="text-[24px] font-bold tracking-tight">{sek(total)}</p>
          </div>
          <Link href={`/newwave/s/${slug}#produkter`} className="mt-3 inline-block text-[13.5px] font-medium underline underline-offset-4">
            + Lägg till fler produkter
          </Link>
        </div>

        <form onSubmit={submit} className="min-w-0 rounded-[28px] bg-[var(--shop-bg)] p-5 sm:p-6">
          <h2 className="text-[18px] font-bold">Era uppgifter</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-[13px] font-medium">
                {f.label}
                {f.required ? "" : " (valfritt)"}
                <input
                  type={f.type}
                  required={f.required}
                  autoComplete={f.auto}
                  value={company[f.key]}
                  maxLength={f.key === "phone" ? 40 : 80}
                  onChange={(e) => setCompany((c) => ({ ...c, [f.key]: e.target.value }))}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--shop-line)] bg-white px-3 text-[14.5px] outline-none focus:border-[var(--shop)]"
                />
              </label>
            ))}
            <label className="block text-[13px] font-medium sm:col-span-2">
              Behövs senast (valfritt)
              <input type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--shop-line)] bg-white px-3 text-[14.5px] outline-none focus:border-[var(--shop)]" />
            </label>
            <label className="block text-[13px] font-medium sm:col-span-2">
              Meddelande (valfritt)
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="Till exempel tillfälle, färgönskemål eller leveransadress" className="mt-1.5 w-full rounded-xl border border-[var(--shop-line)] bg-white p-3 text-[14.5px] outline-none focus:border-[var(--shop)]" />
            </label>
          </div>
          {error ? <p className="mt-3 text-[13px] text-[#B42318]">{error}</p> : null}
          <button type="submit" disabled={busy} className="mt-5 h-12 w-full rounded-full bg-[var(--shop-accent)] text-[15px] font-semibold text-[var(--shop-on-accent)] transition-transform hover:scale-[1.01] disabled:opacity-50">
            {busy ? "Skickar…" : "Skicka förfrågan"}
          </button>
          <p className="mt-3 text-[12px] opacity-55">Gratis och utan förpliktelser. Ni får en länk där ni ser offerten och kan godkänna den.</p>
        </form>
      </div>
    </div>
  );
}
