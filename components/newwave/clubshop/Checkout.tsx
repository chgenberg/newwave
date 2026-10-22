"use client";

/* eslint-disable @next/next/no-img-element -- mockups per klubb */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Contact, placeOrder, setQty, type ShopLine, totals, unitPrice, useClubCart } from "./cart";
import { DELIVERY, DELIVERY_DAYS, type DeliveryId, FREE_SHIPPING_FROM, kr, MAX_QTY, PAYMENTS, type PaymentId, shipping, workdaysAfter } from "./pricing";
import { track } from "./track";

const EMPTY_CONTACT: Contact = { name: "", email: "", phone: "", street: "", zip: "", city: "" };
const FIELDS: { key: keyof Contact; label: string; type?: string; auto: string; wide?: boolean; address?: boolean }[] = [
  { key: "name", label: "Namn", auto: "name", wide: true },
  { key: "email", label: "E-post", type: "email", auto: "email" },
  { key: "phone", label: "Mobil", type: "tel", auto: "tel" },
  { key: "street", label: "Gatuadress", auto: "street-address", wide: true, address: true },
  { key: "zip", label: "Postnummer", auto: "postal-code", address: true },
  { key: "city", label: "Ort", auto: "address-level2", address: true },
];

/** Raden i korgen och på kvittot. */
export function LineRow({ line, children }: { line: ShopLine; children?: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-4">
      <Link href={line.href} className="block h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[#F3F2EF]">
        <img src={line.image} alt={line.name} className="h-full w-full object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <Link href={line.href} className="text-[15px] font-semibold hover:underline">
            {line.name}
          </Link>
          <span className="shrink-0 text-[15px] font-semibold">{kr(unitPrice(line) * line.qty)}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-[#6F6B63]">
          Storlek {line.size}
          {line.flock ? ` · ${[line.flock.name, line.flock.number].filter(Boolean).join(" ")} på ryggen` : ""}
          {line.qty > 1 ? ` · ${kr(unitPrice(line))} st` : ""}
        </p>
        {children}
      </div>
    </li>
  );
}

export function Checkout({ clubId, clubName, home }: { clubId: string; clubName: string; home: string }) {
  const router = useRouter();
  const [cart, update] = useClubCart(clubId);
  const [contact, setContact] = useState<Contact | null>(null);
  const [delivery, setDelivery] = useState<DeliveryId>("ombud");
  const [payment, setPayment] = useState<PaymentId>("swish");
  const [error, setError] = useState("");
  const form = contact ?? cart.contact ?? EMPTY_CONTACT;
  const sum = totals(cart.lines, delivery);
  const needsAddress = delivery !== "butik";

  if (!cart.lines.length) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 text-center">
        <h1 className="text-[30px] font-black tracking-[-0.02em]">Varukorgen är tom</h1>
        <p className="mt-2 text-[15px] text-[#6F6B63]">Hitta något med {clubName} på.</p>
        <Link href={home} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
          Till butiken
        </Link>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = FIELDS.filter((f) => (needsAddress || !f.address) && !form[f.key].trim());
    if (missing.length) return setError(`Fyll i ${missing.map((f) => f.label.toLowerCase()).join(", ")}.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError("Kontrollera e-postadressen.");
    if (needsAddress && !/^\d{3}\s?\d{2}$/.test(form.zip.trim())) return setError("Postnumret har fem siffror.");
    const placed = placeOrder(cart, form, delivery, payment, "IS");
    update(() => placed);
    if (placed.order) track(clubId, { type: "order", number: placed.order.number, delivery, lines: cart.lines.map((l) => ({ item: l.item, qty: l.qty, flock: Boolean(l.flock) })) });
    router.push(`${home}/tack`);
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-[1320px] gap-10 px-4 pt-8 sm:px-6 lg:grid-cols-[1fr_400px]">
      <div className="min-w-0">
        <h1 className="text-[30px] font-black tracking-[-0.02em] sm:text-[36px]">Kassan</h1>
        <ul className="mt-4 divide-y divide-[#ECEAE5] border-y border-[#ECEAE5]">
          {cart.lines.map((l) => (
            <LineRow key={l.key} line={l}>
              <div className="mt-2 flex items-center gap-2">
                <select aria-label={`Antal ${l.name}`} value={l.qty} onChange={(e) => update((c) => setQty(c, l.key, Number(e.target.value)))} className="h-9 rounded-lg border border-[#DCDAD4] bg-white px-2 text-[14px]">
                  {Array.from({ length: MAX_QTY }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => update((c) => setQty(c, l.key, 0))} className="text-[13px] text-[#6F6B63] underline underline-offset-4 hover:text-[#111]">
                  Ta bort
                </button>
              </div>
            </LineRow>
          ))}
        </ul>

        <fieldset className="mt-8">
          <legend className="text-[18px] font-bold">Dina uppgifter</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FIELDS.filter((f) => needsAddress || !f.address).map((f) => (
              <label key={f.key} className={`grid gap-1 text-[12.5px] text-[#6F6B63] ${f.wide ? "sm:col-span-2" : ""}`}>
                {f.label}
                <input
                  type={f.type ?? "text"}
                  autoComplete={f.auto}
                  value={form[f.key]}
                  onChange={(e) => {
                    setContact({ ...form, [f.key]: e.target.value });
                    setError("");
                  }}
                  className="h-12 rounded-xl border border-[#DCDAD4] px-3 text-[15px] text-[#111] outline-none focus:border-[#111]"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-8">
          <legend className="text-[18px] font-bold">Leverans</legend>
          <div className="mt-3 grid gap-2">
            {DELIVERY.map((d) => {
              const price = shipping(d.id, sum.subtotal);
              return (
                <label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${delivery === d.id ? "border-[var(--shop)] bg-[var(--shop-bg)]" : "border-[#DCDAD4]"}`}>
                  <input type="radio" name="leverans" checked={delivery === d.id} onChange={() => setDelivery(d.id)} className="h-5 w-5 accent-[var(--shop)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{d.label}</span>
                    <span className="block text-[13px] text-[#6F6B63]">{d.text}</span>
                  </span>
                  <span className="text-[14px] font-semibold">{price ? kr(price) : "0 kr"}</span>
                </label>
              );
            })}
          </div>
          {sum.subtotal < FREE_SHIPPING_FROM ? <p className="mt-2 text-[13px] text-[#6F6B63]">Handla för {kr(FREE_SHIPPING_FROM - sum.subtotal)} till så blir frakten till ombud gratis.</p> : null}
        </fieldset>

        <fieldset className="mt-8">
          <legend className="text-[18px] font-bold">Betalning</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAYMENTS.map((p) => (
              <label key={p.id} className={`flex h-12 cursor-pointer items-center gap-2.5 rounded-full border px-4 text-[14.5px] font-medium transition ${payment === p.id ? "border-[var(--shop)] bg-[var(--shop-bg)]" : "border-[#DCDAD4]"}`}>
                <input type="radio" name="betalning" checked={payment === p.id} onChange={() => setPayment(p.id)} className="h-4 w-4 accent-[var(--shop)]" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-[24px] bg-[var(--shop-bg)] p-5">
          <p className="text-[18px] font-bold">Summa</p>
          <dl className="mt-3 grid gap-2 text-[14.5px]">
            <div className="flex justify-between">
              <dt>Varor ({sum.count} st)</dt>
              <dd>{kr(sum.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Frakt</dt>
              <dd>{kr(sum.shipping)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--shop-line)] pt-3 text-[18px] font-bold">
              <dt>Att betala</dt>
              <dd>{kr(sum.total)}</dd>
            </div>
            <div className="flex justify-between text-[12.5px] text-[#6F6B63]">
              <dt>Varav moms</dt>
              <dd>{kr(sum.vat)}</dd>
            </div>
          </dl>
          {error ? <p className="mt-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
          <button type="submit" className="mt-4 h-12 w-full rounded-full bg-[var(--shop)] text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90">
            Lägg beställningen
          </button>
          <p className="mt-3 text-[12px] leading-snug text-[#6F6B63]">Det här är en demo av Intersports klubbshop: ingen beställning skickas, inget mejl går iväg och inga pengar dras.</p>
        </div>
      </aside>
    </form>
  );
}

export function Confirmation({ clubId, clubName, home }: { clubId: string; clubName: string; home: string }) {
  const [cart] = useClubCart(clubId);
  const o = cart.order;
  if (!o) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 text-center">
        <h1 className="text-[30px] font-black tracking-[-0.02em]">Ingen beställning än</h1>
        <Link href={home} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
          Till butiken
        </Link>
      </div>
    );
  }
  const d = DELIVERY.find((x) => x.id === o.delivery);
  const pay = PAYMENTS.find((x) => x.id === o.payment);
  return (
    <div className="mx-auto max-w-[760px] px-4 pt-10 sm:px-6">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#6F6B63]">Order {o.number}</p>
      <h1 className="mt-1 text-[34px] font-black leading-[1.05] tracking-[-0.02em] sm:text-[44px]">Tack, {o.contact.name.split(" ")[0]}!</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-[#4A4740]">
        Din beställning är lagd hos Intersport och trycks nu hos New Wave. Tack för att du stöttar {clubName}!
      </p>
      <p className="mt-2 text-[15px] text-[#4A4740]">
        {d?.id === "butik" ? "Att hämta i butiken" : "Levereras"} <DeliveryWindow at={o.at} />
      </p>
      <ul className="mt-6 divide-y divide-[#ECEAE5] border-y border-[#ECEAE5]">
        {o.lines.map((l) => (
          <LineRow key={l.key} line={l} />
        ))}
      </ul>
      <dl className="mt-4 grid gap-1.5 text-[14.5px]">
        <div className="flex justify-between">
          <dt>Frakt · {d?.label}</dt>
          <dd>{kr(o.shipping)}</dd>
        </div>
        <div className="flex justify-between text-[18px] font-bold">
          <dt>Totalt · {pay?.label}</dt>
          <dd>{kr(o.total)}</dd>
        </div>
      </dl>
      <p className="mt-6 rounded-2xl bg-[var(--shop-bg)] p-4 text-[13.5px] text-[#4A4740]">Demo: ingenting har skickats till {o.contact.email} och inga pengar har dragits.</p>
      <Link href={home} className="mt-6 inline-flex h-12 items-center rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)]">
        Fortsätt handla
      </Link>
    </div>
  );
}

function DeliveryWindow({ at }: { at: string }) {
  const [from, to] = DELIVERY_DAYS.map((n) => workdaysAfter(new Date(at), n));
  const f = new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short" });
  return (
    <b>
      {f.format(from)} – {f.format(to)}
    </b>
  );
}
