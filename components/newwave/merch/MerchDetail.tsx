"use client";

/* eslint-disable @next/next/no-img-element */
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { METHOD_INFO } from "@/lib/newwave/marking";
import type { MerchClub, MerchItem } from "@/lib/newwave/merch";
import { sek } from "@/lib/newwave/reseller";
import { EASE } from "../motion/Motion";
import { MerchImage } from "./MerchImage";

const Product3D = dynamic(() => import("./Product3D").then((m) => m.Product3D), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#F4F4F2]" aria-hidden /> });

type View = "bild" | "3d" | "tryck";

const VIEWS: [View, string][] = [
  ["bild", "Bild"],
  ["3d", "3D"],
  ["tryck", "Trycket"],
];

/** Produktens detaljer i en panel till höger: bild, 3D och trycket, storlekarna och länken till klubbens butik. `onClub` visar länken till klubbens sida. */
export function MerchDetail({ item, club, onClub, onClose }: { item: MerchItem; club: MerchClub; onClub: boolean; onClose: () => void }) {
  const product = nwProduct(item.productId)!;
  const [view, setView] = useState<View>("bild");
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const d = item.design;
  const method = METHOD_INFO[d.method];

  return (
    <div className="fixed inset-0 z-[80]">
      <motion.div className="absolute inset-0 bg-[rgba(17,17,17,0.28)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} – ${item.club}`}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-[-30px_0_80px_-30px_rgba(17,17,17,0.45)] sm:w-[min(600px,100%)] sm:rounded-l-[28px]"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <header className="flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] px-5 py-3.5 sm:px-7">
          <img src={item.crest} alt="" className="h-9 w-9 shrink-0 rounded-full bg-[#F4F4F2] object-contain p-1" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[14px] font-semibold">{item.club}</p>
            <p className="truncate text-[12.5px] text-[#6F6B63]">{item.motif}</p>
          </div>
          <button ref={close} type="button" onClick={onClose} aria-label="Stäng" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F1F1EE] transition hover:bg-[#E6E5E0]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-5 sm:px-7">
          <div className="relative aspect-square overflow-hidden rounded-[24px] bg-[#F4F4F2]">
            {view === "bild" ? <MerchImage item={item} /> : null}
            {view === "3d" ? <Product3D product={product} design={d} art={item.art} color={item.color} /> : null}
            {view === "tryck" ? (
              <div className="grid h-full w-full place-items-center p-10" style={{ background: item.color }}>
                <img src={d.logo ? (d.logoDark && product.dark ? d.logoDark : d.logo) : product.dark ? item.art.dark : item.art.light} alt={`Trycket på ${item.name}`} className="max-h-full max-w-full object-contain" />
              </div>
            ) : null}
            {view === "3d" ? <p className="nw-mono pointer-events-none absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-1 text-[11px] text-[#6F6B63] backdrop-blur">Dra för att snurra</p> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Visa produkten" className="inline-grid grid-flow-col gap-1 rounded-full bg-[#F1F1EE] p-1">
              {VIEWS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`h-8 rounded-full px-4 text-[13px] font-medium transition-colors ${view === id ? "bg-white text-[#111] shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-[#6F6B63] hover:text-[#111]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] text-[#6F6B63]">{colorName(item.color)}</p>
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[clamp(24px,3vw,30px)] font-semibold leading-[1.05] tracking-[-0.035em]">{item.name}</h2>
              <p className="mt-1 text-[14px] text-[#6F6B63]">
                {item.motif} · {item.club}
              </p>
            </div>
            <p className="shrink-0 text-[22px] font-semibold tracking-[-0.02em]">{sek(item.priceSek)}</p>
          </div>

          <div className="mt-6">
            <p className="text-[14px] font-medium">Storlekar</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {product.sizes.map((s) => (
                <span key={s} className="rounded-lg border border-[rgba(17,17,17,0.1)] px-2.5 py-1.5 text-[12.5px] text-[#3F3D38]">
                  {s === "One size" ? "En storlek" : s}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <a href={club.shopUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#111] px-5 text-[14.5px] font-semibold text-white transition hover:opacity-90">
              Köp hos Intersport
              <span aria-hidden>↗</span>
            </a>
            {onClub ? (
              <Link href={`/newwave/merch/${club.id}`} className="inline-flex h-12 items-center justify-center rounded-full bg-[#F1F1EE] px-5 text-[14.5px] font-semibold text-[#111] transition hover:bg-[#E6E5E0]">
                Mer från {club.name}
              </Link>
            ) : null}
          </div>
          <p className="mt-2.5 text-center text-[12px] text-[#6F6B63] sm:text-left">Säljs i {club.owner} butik hos Intersport.</p>

          <div className="mt-6 rounded-[20px] bg-[#F6F6F3] p-4 text-[13.5px] leading-relaxed">
            <p className="font-semibold">Vill du ha en egen variant?</p>
            <p className="mt-0.5 text-[#6F6B63]">Här visas klubbens färdiga merch. Nya motiv och egna varianter tar klubben fram på sin egen sida.</p>
            {club.ownPage ? (
              <Link href={club.ownPage} className="mt-2 inline-block font-medium text-[#111] underline decoration-[#D9D6CE] underline-offset-4 hover:decoration-[#111]">
                Till {club.owner} sida →
              </Link>
            ) : null}
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[rgba(17,17,17,0.07)] pt-5 text-[13px]">
            <div>
              <dt className="text-[#6F6B63]">Tryck</dt>
              <dd>
                {method.label}, {d.colors === 4 ? "fyrfärg" : `${d.colors} färg${d.colors > 1 ? "er" : ""}`}
              </dd>
            </div>
            <div>
              <dt className="text-[#6F6B63]">Tillverkning</dt>
              <dd>Trycks på beställning, ca {method.days} dagar</dd>
            </div>
            <div>
              <dt className="text-[#6F6B63]">Passar till</dt>
              <dd>{product.use}</dd>
            </div>
            <div>
              <dt className="text-[#6F6B63]">Till klubben</dt>
              <dd>Varje köp stöttar {item.club}</dd>
            </div>
          </dl>
        </div>
      </motion.aside>
    </div>
  );
}
