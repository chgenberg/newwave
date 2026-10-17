"use client";

import { useRef, useState } from "react";
import type { LogoResult } from "@/lib/logo";
import { DEMO_CUSTOMERS, shopUrl, type Reseller } from "@/lib/newwave/reseller";
import { call, readDataUrl } from "./api";
import { PLACEHOLDER } from "./cart";
import { ScaledPreview } from "./ScaledPreview";
import { ShopFrame, ShopHome } from "./Storefront";

type Art = { light: string; dark: string };
const OWN = "egen";

/** Återförsäljarens butik i skala, med startsidan eller produkterna och en vald kundlogga på produkterna. */
export function ShopPreview({ shop, height }: { shop: Reseller; height?: string }) {
  const [page, setPage] = useState<"hem" | "produkter">("hem");
  const [pick, setPick] = useState(DEMO_CUSTOMERS[0].name);
  const [own, setOwn] = useState<Art | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const customer = DEMO_CUSTOMERS.find((c) => c.name === pick);
  const sample: Art = pick === OWN && own ? own : customer ? { light: customer.logo, dark: customer.logoDark } : PLACEHOLDER;

  const upload = async (f: File) => {
    setBusy(true);
    try {
      const l = await call<LogoResult>("/api/v1/logo", { dataUrl: await readDataUrl(f), name: f.name.replace(/\.[^.]+$/, "") });
      setOwn({ light: l.light, dark: l.dark });
      setPick(OWN);
      setPage("produkter");
    } finally {
      setBusy(false);
    }
  };

  const tools = (
    <>
      <div className="nw-segment">
        <button type="button" aria-pressed={page === "hem"} onClick={() => setPage("hem")}>
          Startsidan
        </button>
        <button type="button" aria-pressed={page === "produkter"} onClick={() => setPage("produkter")}>
          Produkterna
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--nw-muted)]">
        <span className="hidden sm:inline">Kund</span>
        <select
          value={pick}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value === OWN && !own) return file.current?.click();
            setPick(e.target.value);
            setPage("produkter");
          }}
          className="h-9 max-w-[170px] rounded-full border border-[var(--nw-line)] bg-white px-3 text-[12.5px] font-medium text-[var(--nw-ink)]"
          aria-label="Visa produkterna med en kunds logga"
        >
          {DEMO_CUSTOMERS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value={OWN}>{busy ? "Laddar upp…" : own ? "Er uppladdade logga" : "Ladda upp en logga…"}</option>
        </select>
      </label>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label="Välj en kundlogga" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </>
  );

  return (
    <ScaledPreview url={shopUrl(shop)} tools={tools} height={height}>
      <ShopFrame shop={shop} preview>
        <ShopHome shop={shop} preview sample={sample} only={page === "produkter" ? "produkter" : undefined} />
      </ShopFrame>
    </ScaledPreview>
  );
}
