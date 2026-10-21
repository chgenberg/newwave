"use client";

import { useState } from "react";
import { type PaymentId, SHOP } from "@/lib/newwave/sportshop/data";
import { Logo } from "./Header";
import { useLang } from "./Lang";

/** Betal- och fraktsätten som enkla textmärken i ungefär rätt färger, inte som kopior av varumärkenas logotyper. */
const PAY: Record<PaymentId | "visa" | "mastercard", { label: string; className: string }> = {
  paypal: { label: "PayPal", className: "bg-white text-[#003087] italic font-extrabold" },
  invoice: { label: "Klarna.", className: "bg-[#FFB3C7] text-[#17120F] font-extrabold" },
  installments: { label: "Klarna.", className: "bg-[#FFB3C7] text-[#17120F] font-extrabold" },
  visa: { label: "VISA", className: "bg-white text-[#1A1F71] italic font-black tracking-[0.04em]" },
  mastercard: { label: "Mastercard", className: "bg-white text-[#EB001B] font-bold" },
  card: { label: "Kreditkarte", className: "bg-white text-[#111] font-bold" },
  sepa: { label: "SEPA", className: "bg-white text-[#10298E] font-black tracking-[0.06em]" },
  applepay: { label: "Apple Pay", className: "bg-[#111] text-white font-semibold" },
  prepay: { label: "Vorkasse", className: "bg-white text-[#3A3833] font-semibold" },
};
const FOOTER_PAY = ["paypal", "invoice", "visa", "mastercard", "sepa", "applepay", "prepay"] as const;
const SHIP = [
  { label: "DHL", className: "bg-[#FFCC00] text-[#D40511] italic font-black" },
  { label: "DHL Express", className: "bg-[#FFCC00] text-[#D40511] italic font-black" },
  { label: "Hermes", className: "bg-white text-[#0091CD] font-extrabold" },
  { label: "Click & Collect", className: "bg-white text-[#0F2741] font-bold" },
];

export function PayBadge({ id }: { id: keyof typeof PAY }) {
  const p = PAY[id];
  return <span className={`inline-flex h-7 items-center rounded-[5px] px-2 text-[12px] leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${p.className}`}>{p.label}</span>;
}

export function PayBadges({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-wrap gap-1.5 ${className}`}>
      {FOOTER_PAY.map((id) => (
        <PayBadge key={id} id={id} />
      ))}
    </span>
  );
}

const SOCIAL = [
  { label: "Instagram", d: "M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM17.2 6.3h.01" },
  { label: "Facebook", d: "M14 8h2.5V4.5H14c-2.2 0-3.8 1.7-3.8 3.9V10H8v3.5h2.2V21h3.6v-7.5h2.4L17 10h-3.2V8.6c0-.4.3-.6.7-.6z" },
  { label: "YouTube", d: "M21 8.2c-.2-1.4-1.2-2.4-2.6-2.5C16.6 5.5 12 5.5 12 5.5s-4.6 0-6.4.2C4.2 5.8 3.2 6.8 3 8.2 2.8 9.5 2.8 12 2.8 12s0 2.5.2 3.8c.2 1.4 1.2 2.4 2.6 2.5 1.8.2 6.4.2 6.4.2s4.6 0 6.4-.2c1.4-.1 2.4-1.1 2.6-2.5.2-1.3.2-3.8.2-3.8s0-2.5-.2-3.8zM10.2 15V9l5 3z" },
  { label: "TikTok", d: "M14 3v11.2a3.2 3.2 0 1 1-3.2-3.2M14 3c.4 2.5 2.2 4.3 4.8 4.6" },
];

function Newsletter() {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <div className="grid gap-5 rounded-[18px] bg-white/[0.06] p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
      <div>
        <h2 className="text-[20px] font-bold">{t.footer.newsletter}</h2>
        <p className="mt-1 text-[14px] text-white/70">{t.footer.newsletterText}</p>
      </div>
      {done ? (
        <p role="status" className="text-[14px] font-medium text-white">
          {t.footer.subscribed}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDone(true);
          }}
          className="flex w-full gap-2 md:w-[420px]"
        >
          <label className="sr-only" htmlFor="sl-newsletter">
            {t.footer.emailPlaceholder}
          </label>
          <input id="sl-newsletter" type="email" required placeholder={t.footer.emailPlaceholder} className="h-11 min-w-0 flex-1 rounded-full bg-white px-4 text-[14.5px] text-[#111] outline-none placeholder:text-[#8A8780] focus:ring-2 focus:ring-[#FF6A13]" />
          <button type="submit" className="h-11 shrink-0 rounded-full bg-[#FF6A13] px-5 text-[14px] font-semibold text-white transition hover:bg-[#E85A06]">
            {t.footer.subscribe}
          </button>
        </form>
      )}
    </div>
  );
}

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-[14px] text-white/65">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="mt-20 bg-[#0F2741] text-white">
      <div className="mx-auto max-w-[1320px] px-4 pb-8 pt-12 sm:px-6">
        <Newsletter />
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          <Column title={t.footer.service} items={t.footer.serviceLinks} />
          <Column title={t.footer.about} items={t.footer.aboutLinks} />
          <Column title={t.footer.legal} items={t.footer.legalLinks} />
          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-[0.1em]">{t.footer.store}</h3>
            <address className="mt-3 space-y-0.5 text-[14px] not-italic text-white/65">
              <p>{SHOP.name}</p>
              <p>{SHOP.street}</p>
              <p>{SHOP.city}</p>
              <p className="pt-2">{SHOP.phone}</p>
              <p>{SHOP.email}</p>
              {t.footer.hours.map((h) => (
                <p key={h} className="first-of-type:pt-2">
                  {h}
                </p>
              ))}
            </address>
          </div>
        </div>
        <div className="mt-12 grid gap-8 border-t border-white/10 pt-8 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/60">{t.footer.pay}</h3>
            <PayBadges className="mt-3" />
          </div>
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/60">{t.footer.ship}</h3>
            <span className="mt-3 flex flex-wrap gap-1.5">
              {SHIP.map((s) => (
                <span key={s.label} className={`inline-flex h-7 items-center rounded-[5px] px-2 text-[12px] leading-none ${s.className}`}>
                  {s.label}
                </span>
              ))}
            </span>
          </div>
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/60">{t.footer.follow}</h3>
            <span className="mt-2 flex gap-1">
              {SOCIAL.map((s) => (
                <span key={s.label} title={s.label} className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-white/80">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label={s.label} role="img">
                    <path d={s.d} />
                  </svg>
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-[12.5px] text-white/55 md:flex-row md:items-center md:justify-between">
          <span className="flex items-center gap-4">
            <span className="scale-90 opacity-90">
              <Logo light />
            </span>
            <span>
              © {new Date().getFullYear()} {SHOP.name} GmbH · {t.footer.rights}
            </span>
          </span>
          <span>{t.footer.demo}</span>
        </div>
      </div>
    </footer>
  );
}
