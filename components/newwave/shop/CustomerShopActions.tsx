"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "./api";

/** Stäng, öppna eller ta bort en kundbutik. Borttagning kräver ett andra klick. */
export function CustomerShopActions({ id, open }: { id: string; open: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");

  const run = async (action: "open" | "close" | "delete") => {
    setBusy(true);
    setError("");
    try {
      await call("/api/v1/newwave/customer-shops", { action, id });
      if (action === "delete") router.push("/newwave/shop/butiken");
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Det gick inte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <button type="button" disabled={busy} onClick={() => run(open ? "close" : "open")} className="nw-btn nw-btn-ghost disabled:opacity-50">
        {open ? "Stäng butiken" : "Öppna butiken igen"}
      </button>
      {confirm ? (
        <>
          <span className="text-[var(--nw-ink)]">Länken slutar fungera. Ordrarna finns kvar.</span>
          <button type="button" disabled={busy} onClick={() => run("delete")} className="nw-btn nw-btn-ghost text-[#B42318] disabled:opacity-50">
            Ja, ta bort
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="nw-hit text-[var(--nw-muted)] underline underline-offset-4">
            Avbryt
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="nw-hit text-[var(--nw-muted)] underline underline-offset-4 hover:text-[var(--nw-ink)]">
          Ta bort
        </button>
      )}
      {error ? <span className="text-[#B42318]">{error}</span> : null}
    </div>
  );
}
