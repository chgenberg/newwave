"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE, type PaymentId, PAYMENTS, SHIPPING, type ShippingId, shippingCost } from "@/lib/newwave/sportshop/data";
import { type Address, CART, placeOrder, totals, useSportCart } from "./cart";
import { LineRow, SummaryRows, useReady } from "./CartView";
import { PayBadge } from "./Footer";
import { useLang } from "./Lang";

const EMPTY_ADDRESS: Address = { salutation: 0, first: "", last: "", street: "", zip: "", city: "", email: "", phone: "" };
const DEMO_ADDRESS: Address = { salutation: 1, first: "Jonas", last: "Becker", street: "Gütersloher Straße 41", zip: "33649", city: "Bielefeld", email: "jonas.becker@example.de", phone: "" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP = /^\d{5}$/;

type Field = Exclude<keyof Address, "salutation">;

function errorsOf(a: Address) {
  const e: Partial<Record<Field, "required" | "invalidEmail" | "invalidZip">> = {};
  for (const f of ["first", "last", "street", "zip", "city", "email"] as const) if (!a[f].trim()) e[f] = "required";
  if (a.email.trim() && !EMAIL.test(a.email.trim())) e.email = "invalidEmail";
  if (a.zip.trim() && !ZIP.test(a.zip.trim())) e.zip = "invalidZip";
  return e;
}

function Step({ n, title, state, summary, onEdit, children }: { n: number; title: string; state: "done" | "active" | "todo"; summary?: React.ReactNode; onEdit?: () => void; children?: React.ReactNode }) {
  const { t } = useLang();
  return (
    <section aria-current={state === "active" ? "step" : undefined} className={`rounded-[20px] bg-white ring-1 ring-[#ECECE9] ${state === "todo" ? "opacity-55" : ""}`}>
      <header className="flex items-center gap-3 px-5 py-4 sm:px-6">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-bold ${state === "done" ? "bg-[#16A34A] text-white" : state === "active" ? "bg-[#0F2741] text-white" : "bg-[#ECECE9] text-[#6F6B63]"}`}>
          {state === "done" ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8.5l3 3 7-7" />
            </svg>
          ) : (
            n
          )}
        </span>
        <h2 className="flex-1 text-[17px] font-bold text-[#111]">{title}</h2>
        {state === "done" && onEdit ? (
          <button type="button" onClick={onEdit} className="text-[13.5px] font-semibold text-[#0F2741] underline underline-offset-2">
            {t.checkout.edit}
          </button>
        ) : null}
      </header>
      {state === "done" && summary ? <div className="-mt-1 px-5 pb-4 pl-[64px] text-[14px] text-[#55524B] sm:px-6 sm:pl-[68px]">{summary}</div> : null}
      {state === "active" ? <div className="border-t border-[#F1F1EF] px-5 py-5 sm:px-6">{children}</div> : null}
    </section>
  );
}

function Input({ label, value, onChange, error, type = "text", autoComplete, className = "", inputMode }: { label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; autoComplete?: string; className?: string; inputMode?: "numeric" | "email" | "tel" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[12.5px] font-medium text-[#55524B]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        className={`mt-1 h-11 w-full rounded-[10px] bg-[#F5F5F3] px-3 text-[15px] text-[#111] outline-none ring-[#0F2741] focus:bg-white focus:ring-2 ${error ? "ring-2 ring-[#D7262E]" : ""}`}
      />
      {error ? <span className="mt-1 block text-[12.5px] font-medium text-[#D7262E]">{error}</span> : null}
    </label>
  );
}

function Choice({ name, checked, onChange, title, note, right }: { name: string; checked: boolean; onChange: () => void; title: string; note: string; right?: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-[14px] p-3.5 transition ${checked ? "bg-[#F2F5F9] ring-2 ring-[#0F2741]" : "ring-1 ring-[#E2E2DF] hover:ring-[#C9C7C0]"}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-[18px] w-[18px] shrink-0 accent-[#0F2741]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-[#111]">{title}</span>
        <span className="block text-[12.5px] text-[#6F6B63]">{note}</span>
      </span>
      {right}
    </label>
  );
}

const PAY_BADGE: Record<PaymentId, Parameters<typeof PayBadge>[0]["id"]> = { paypal: "paypal", invoice: "invoice", installments: "installments", card: "visa", sepa: "sepa", applepay: "applepay", prepay: "prepay" };

export function Checkout() {
  const { t, money } = useLang();
  const router = useRouter();
  const ready = useReady();
  const [cart, setCart] = useSportCart(CART);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Address | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [shipping, setShipping] = useState<ShippingId>("dhl");
  const [payment, setPayment] = useState<PaymentId>("paypal");
  const [agb, setAgb] = useState(false);
  const [agbError, setAgbError] = useState(false);
  const [placing, setPlacing] = useState(false);

  if (!ready) return <div className="h-64" />;
  if (!cart.lines.length && !placing)
    return (
      <div className="rounded-[20px] bg-white p-10 text-center ring-1 ring-[#ECECE9]">
        <p className="text-[17px] font-semibold text-[#111]">{t.cartPage.empty}</p>
        <Link href={BASE} className="mt-5 inline-flex h-11 items-center rounded-full bg-[#0F2741] px-6 text-[14.5px] font-semibold text-white">
          {t.cartPage.emptyCta}
        </Link>
      </div>
    );

  const address = draft ?? cart.address ?? EMPTY_ADDRESS;
  const setAddress = (fn: (a: Address) => Address) => setDraft(fn(address));
  const sum = totals(cart.lines, shipping);
  const errors = errorsOf(address);
  const err = (f: Field) => (showErrors && errors[f] ? t.checkout[errors[f]] : undefined);
  const set = (f: Field) => (v: string) => setAddress((a) => ({ ...a, [f]: f === "zip" ? v.replace(/\D/g, "").slice(0, 5) : v }));
  const ship = (id: ShippingId) => t.shipping[id];
  const state = (i: number) => (i < step ? "done" : i === step ? "active" : "todo");

  const submitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    setCart((c) => ({ ...c, address }));
    setStep(1);
  };
  const place = () => {
    if (!agb) {
      setAgbError(true);
      return;
    }
    setPlacing(true);
    setCart((c) => placeOrder(c, address, shipping, payment));
    router.push(`${BASE}/bestellung`);
  };

  const next = (
    <div className="mt-5 flex justify-end gap-2">
      {step > 0 ? (
        <button type="button" onClick={() => setStep(step - 1)} className="h-11 rounded-full px-5 text-[14px] font-semibold text-[#0F2741] hover:bg-[#F5F5F3]">
          {t.checkout.back}
        </button>
      ) : null}
      <button type={step === 0 ? "submit" : "button"} onClick={step === 0 ? undefined : () => setStep(step + 1)} className="h-11 rounded-full bg-[#0F2741] px-6 text-[14.5px] font-semibold text-white transition hover:bg-[#1A3A5E]">
        {t.checkout.next}
      </button>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-10">
      <ol className="space-y-3" aria-label={t.checkout.title}>
        <li>
          <Step
            n={1}
            title={t.checkout.address}
            state={state(0)}
            onEdit={() => setStep(0)}
            summary={
              <>
                {address.first} {address.last}, {address.street}, {address.zip} {address.city} · {address.email}
              </>
            }
          >
            <form onSubmit={submitAddress} noValidate>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label={t.checkout.salutation} className="flex gap-1.5">
                  {t.checkout.salutations.map((s, i) => (
                    <button key={s} type="button" role="radio" aria-checked={address.salutation === i} onClick={() => setAddress((a) => ({ ...a, salutation: i }))} className={`h-9 rounded-full px-3.5 text-[13.5px] font-semibold transition ${address.salutation === i ? "bg-[#0F2741] text-white" : "bg-[#F5F5F3] text-[#3A3833] hover:bg-[#ECECE9]"}`}>
                      {s}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setDraft(DEMO_ADDRESS)} className="text-[13px] font-semibold text-[#0F2741] underline underline-offset-2">
                  {t.checkout.fillDemo}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t.checkout.first} value={address.first} onChange={set("first")} error={err("first")} autoComplete="given-name" />
                <Input label={t.checkout.last} value={address.last} onChange={set("last")} error={err("last")} autoComplete="family-name" />
                <Input label={t.checkout.street} value={address.street} onChange={set("street")} error={err("street")} autoComplete="street-address" className="col-span-2" />
                <Input label={t.checkout.zip} value={address.zip} onChange={set("zip")} error={err("zip")} autoComplete="postal-code" inputMode="numeric" />
                <Input label={t.checkout.city} value={address.city} onChange={set("city")} error={err("city")} autoComplete="address-level2" />
                <label className="col-span-2 block">
                  <span className="text-[12.5px] font-medium text-[#55524B]">{t.checkout.country}</span>
                  <span className="mt-1 flex h-11 items-center rounded-[10px] bg-[#F5F5F3] px-3 text-[15px] text-[#55524B]">{t.checkout.countryValue}</span>
                </label>
                <Input label={t.checkout.email} value={address.email} onChange={set("email")} error={err("email")} type="email" autoComplete="email" inputMode="email" className="col-span-2 sm:col-span-1" />
                <Input label={t.checkout.phone} value={address.phone} onChange={set("phone")} type="tel" autoComplete="tel" inputMode="tel" className="col-span-2 sm:col-span-1" />
              </div>
              {next}
            </form>
          </Step>
        </li>
        <li>
          <Step n={2} title={t.checkout.shippingTitle} state={state(1)} onEdit={() => setStep(1)} summary={`${ship(shipping).name} · ${sum.shipping ? money(sum.shipping) : t.cartPage.free}`}>
            <div className="space-y-2" role="radiogroup" aria-label={t.checkout.shippingTitle}>
              {SHIPPING.map((s) => {
                const cost = shippingCost(s.id, sum.subtotal);
                return <Choice key={s.id} name="shipping" checked={shipping === s.id} onChange={() => setShipping(s.id)} title={ship(s.id).name} note={ship(s.id).note} right={<span className={`text-[14px] font-semibold ${cost ? "text-[#111]" : "text-[#16A34A]"}`}>{cost ? money(cost) : t.cartPage.free}</span>} />;
              })}
            </div>
            {next}
          </Step>
        </li>
        <li>
          <Step n={3} title={t.checkout.paymentTitle} state={state(2)} onEdit={() => setStep(2)} summary={t.payment[payment].name}>
            <div className="space-y-2" role="radiogroup" aria-label={t.checkout.paymentTitle}>
              {PAYMENTS.map((id) => (
                <Choice key={id} name="payment" checked={payment === id} onChange={() => setPayment(id)} title={t.payment[id].name} note={t.payment[id].note} right={<PayBadge id={PAY_BADGE[id]} />} />
              ))}
            </div>
            {next}
          </Step>
        </li>
        <li>
          <Step n={4} title={t.checkout.review} state={state(3)}>
            <ul className="divide-y divide-[#F1F1EF] lg:hidden">
              {cart.lines.map((l) => (
                <LineRow key={l.key} line={l} compact />
              ))}
            </ul>
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-[12px] p-3 text-[14px] text-[#3A3833] ${agbError ? "bg-[#FDECEC] ring-1 ring-[#D7262E]" : "bg-[#F5F5F3]"}`}>
              <input
                type="checkbox"
                checked={agb}
                onChange={(e) => {
                  setAgb(e.target.checked);
                  setAgbError(false);
                }}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#0F2741]"
              />
              <span>{t.checkout.agb}</span>
            </label>
            {agbError ? (
              <p role="alert" className="mt-2 text-[13px] font-medium text-[#D7262E]">
                {t.checkout.agbMissing}
              </p>
            ) : null}
            <button type="button" onClick={place} disabled={placing} className="mt-4 flex h-13 w-full items-center justify-center rounded-full bg-[#FF6A13] py-3.5 text-[16px] font-bold text-white transition hover:bg-[#E85A06] disabled:opacity-60">
              {t.checkout.order} · {money(sum.total)}
            </button>
            <p className="mt-3 text-center text-[12.5px] text-[#8A8780]">{t.checkout.demo}</p>
            <div className="mt-2 flex justify-start">
              <button type="button" onClick={() => setStep(2)} className="h-10 rounded-full px-4 text-[13.5px] font-semibold text-[#0F2741] hover:bg-[#F5F5F3]">
                {t.checkout.back}
              </button>
            </div>
          </Step>
        </li>
      </ol>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-[20px] bg-white p-5 ring-1 ring-[#ECECE9] sm:p-6">
          <h2 className="text-[16px] font-bold text-[#111]">{t.cartPage.title}</h2>
          <ul className="mt-1 divide-y divide-[#F1F1EF]">
            {cart.lines.map((l) => (
              <LineRow key={l.key} line={l} compact />
            ))}
          </ul>
          <div className="mt-3 border-t border-[#ECECE9] pt-4">
            <SummaryRows lines={cart.lines} sum={sum} />
          </div>
        </div>
      </aside>
    </div>
  );
}
