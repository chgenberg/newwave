"use client";

import Link from "next/link";
import { BASE, SHIPPING, vatOf } from "@/lib/newwave/sportshop/data";
import { CART, eta, pickupAt, printDays, totals, useSportCart } from "./cart";
import { LineRow, SummaryRows, useReady } from "./CartView";
import { useLang } from "./Lang";

export function Confirmation() {
  const { t } = useLang();
  const ready = useReady();
  const [cart] = useSportCart(CART);
  const order = cart.order;
  if (!ready) return <div className="h-64" />;
  if (!order)
    return (
      <div className="rounded-[20px] bg-white p-10 text-center ring-1 ring-[#ECECE9]">
        <p className="text-[17px] font-semibold text-[#111]">{t.done.missing}</p>
        <Link href={BASE} className="mt-5 inline-flex h-11 items-center rounded-full bg-[#0F2741] px-6 text-[14.5px] font-semibold text-white">
          {t.done.continue}
        </Link>
      </div>
    );
  const at = new Date(order.at);
  const days = SHIPPING.find((s) => s.id === order.shipping)?.days ?? 3;
  const pickup = order.shipping === "collect";
  const extra = printDays(order.lines);
  const when = pickup ? pickupAt(at, extra) : eta(at, days + extra);
  const date = new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long", ...(pickup ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(when);
  const a = order.address;
  const sum = { ...totals(order.lines), shipping: order.shippingCost, total: order.total, vat: vatOf(order.total) };
  const facts = [
    { label: t.done.number, value: order.number },
    { label: pickup ? t.done.pickup : t.done.eta, value: date },
    { label: t.done.shipping, value: t.shipping[order.shipping].name },
    { label: t.done.payment, value: t.payment[order.payment].name },
  ];
  return (
    <div className="mx-auto max-w-[860px]">
      <div className="rounded-[22px] bg-white p-6 text-center ring-1 ring-[#ECECE9] sm:p-10">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#E9F6EE]">
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-[#16A34A]" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h1 className="mt-5 text-[28px] font-black tracking-[-0.01em] text-[#0F2741] sm:text-[34px]">{t.done.title}</h1>
        <p className="mt-2 text-[15.5px] text-[#55524B]">{t.done.text}</p>
        <dl className="mt-7 grid gap-3 text-left sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="rounded-[14px] bg-[#F5F5F3] p-4">
              <dt className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A8780]">{f.label}</dt>
              <dd className="mt-1 text-[15.5px] font-semibold text-[#111]">{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-[12.5px] text-[#8A8780]">{t.checkout.demo}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="rounded-[20px] bg-white p-5 ring-1 ring-[#ECECE9] sm:p-6">
          <ul className="divide-y divide-[#F1F1EF]">
            {order.lines.map((l) => (
              <LineRow key={l.key} line={l} compact />
            ))}
          </ul>
          <div className="mt-3 border-t border-[#ECECE9] pt-4">
            <SummaryRows lines={order.lines} sum={sum} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-[20px] bg-white p-5 text-[14px] ring-1 ring-[#ECECE9]">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#8A8780]">{t.done.address}</h2>
            <address className="mt-2 not-italic leading-relaxed text-[#111]">
              {t.checkout.salutations[a.salutation]} {a.first} {a.last}
              <br />
              {a.street}
              <br />
              {a.zip} {a.city}
              <br />
              <span className="text-[#6F6B63]">{a.email}</span>
            </address>
          </div>
          <Link href={BASE} className="flex h-12 items-center justify-center rounded-full bg-[#0F2741] text-[15px] font-semibold text-white transition hover:bg-[#1A3A5E]">
            {t.done.continue}
          </Link>
        </div>
      </div>
    </div>
  );
}
