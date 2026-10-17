"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { nwProduct } from "@/lib/newwave/catalog";
import { type Customized, defaultDesign, type Design } from "@/lib/newwave/marking";
import { sek } from "@/lib/newwave/reseller";
import type { Proof, StudioArt, StudioResult } from "./DesignStudio";

const DesignStudio = dynamic(() => import("./DesignStudio").then((m) => m.DesignStudio), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/30 backdrop-blur-[2px]">
      <p className="rounded-full bg-white px-5 py-2.5 text-[14px] font-medium text-[var(--nw-ink)] shadow-lg">Öppnar designstudion…</p>
    </div>
  ),
});

/** Var en sparad design hamnar när studion öppnas från en sida som renderas på servern. */
export type SaveTarget =
  | { kind: "approval"; clubId: string; approvalId: string }
  | { kind: "shop"; clubId: string; shopProductId: string }
  | { kind: "new-shop"; clubId: string }
  | { kind: "craft"; materialId: string };

export type Saved = Customized & { proofs: Proof[] };

async function upload(dataUrl: string) {
  const res = await fetch("/api/v1/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) });
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !data.url) throw new Error("Kunde inte spara bilden.");
  return data.url;
}

/** Studions bilder laddas upp som filer, så att bara länkar sparas i designen. */
async function store(r: StudioResult): Promise<Saved> {
  const [mockupUrl, ...proofs] = await Promise.all([upload(r.preview), ...r.proofs.map((p) => upload(p.image))]);
  return { design: r.design, color: r.color, mockupUrl, proofs: r.proofs.map((p, i) => ({ label: p.label, image: proofs[i] })) };
}

const ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2 3 7v10l9 5 9-5V7z" />
    <path d="m3 7 9 5 9-5M12 12v10" />
  </svg>
);

/** Märket i hörnet på ett produktkort som öppnar studion. */
const BADGE = "absolute right-2 top-2 z-[1] inline-flex h-8 items-center gap-1 rounded-full bg-[var(--shop,var(--club,#111111))] px-2.5 text-[11.5px] font-semibold tracking-wide text-[var(--shop-on,#ffffff)] shadow-sm transition-transform hover:scale-105 group-hover:scale-105";
const CARD = "group relative block w-full overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-[var(--shop,var(--club,#111111))]";

/**
 * Öppnar designstudion för en produkt. Med `target` sparas designen på servern och sidan laddas om;
 * med `onSaved` får komponenten runt omkring resultatet.
 */
export function StudioButton({
  productId,
  art,
  initial,
  color,
  qty,
  needBy,
  brandColor,
  target,
  onSaved,
  price,
  saveLabel,
  label = "Anpassa",
  className,
  children,
}: {
  productId: string;
  art: StudioArt;
  initial?: Design;
  color?: string;
  qty?: number;
  needBy?: string;
  brandColor?: string;
  target?: SaveTarget;
  onSaved?: (s: Saved) => void | Promise<void>;
  price?: (d: Design, units: number) => [string, string][];
  saveLabel?: string;
  label?: string;
  className?: string;
  /** Det som är klickbart, oftast produktbilden; märket läggs ovanpå i hörnet. Utan barn blir knappen själva märket. */
  children?: ReactNode;
}) {
  const router = useRouter();
  /** Studion öppnas i närmaste tema-behållare, så att klubbens eller butikens färger följer med. */
  const [root, setRoot] = useState<Element | null>(null);
  const open = root !== null;
  const close = () => setRoot(null);
  const product = nwProduct(productId);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!product) return null;

  const save = async (r: StudioResult) => {
    const saved = await store(r);
    if (target) {
      const res = await fetch("/api/v1/newwave/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, productId, art: art.light, design: saved.design, color: saved.color, mockupUrl: saved.mockupUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Kunde inte spara designen.");
    }
    await onSaved?.(saved);
    close();
    if (target) router.refresh();
  };

  const shopPrice = (): [string, string][] => [
    ["Pris i butiken", `${sek(product.priceSek)} inkl. moms`],
    ["Tillverkning", "Trycks på beställning"],
  ];

  return (
    <>
      <button type="button" onClick={(e) => setRoot(e.currentTarget.closest("[data-studio-root], .nw-club") ?? document.body)} aria-label={`${label}: ${product.name} i designstudion`} className={className ?? (children ? CARD : BADGE)}>
        {children ? (
          <>
            {children}
            <span className={BADGE}>
              {ICON}
              {label}
            </span>
          </>
        ) : (
          <>
            {ICON}
            {label}
          </>
        )}
      </button>
      {root
        ? createPortal(
            <DesignStudio
              product={product}
              initial={initial ?? defaultDesign(product)}
              color={color ?? product.garmentHex}
              qty={qty}
              needBy={needBy}
              art={art}
              brandColor={brandColor}
              price={price ?? (target ? shopPrice : undefined)}
              saveLabel={saveLabel ?? (target?.kind === "new-shop" ? "Lägg i butiken" : "Spara design")}
              onSave={save}
              onClose={close}
            />,
            root,
          )
        : null}
    </>
  );
}
