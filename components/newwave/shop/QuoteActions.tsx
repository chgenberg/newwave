"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Saved, StudioButton } from "@/components/newwave/studio/StudioButton";
import { priceLine, type QuoteLine, sek } from "@/lib/newwave/reseller";
import { call } from "./api";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await call("/api/v1/newwave/quotes", body, "PATCH");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Återförsäljaren skickar offerten med en hälsning till kunden. */
export function SendQuote({ id, contact, resend }: { id: string; contact: string; resend?: boolean }) {
  const { busy, error, run } = useAction();
  const [reply, setReply] = useState(`Hej ${contact.split(" ")[0]}! Tack för förfrågan. Här är offerten – vi skickar ett provtryck innan vi kör. Hör av er om ni vill ändra något.`);
  return (
    <div className="rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 sm:p-5">
      <label htmlFor="reply" className="text-[13px] font-semibold text-[var(--nw-ink)]">
        Hälsning till kunden
      </label>
      <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={1000} className="nw-input mt-2 w-full resize-y bg-white" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !reply.trim()} onClick={() => run({ action: "send", id, reply })} className="nw-btn nw-club-btn disabled:opacity-50">
          {busy ? "Skickar…" : resend ? "Skicka igen" : "Skicka offerten"}
        </button>
        <p className="text-[12.5px] text-[var(--nw-muted)]">Kunden får en länk där offerten kan godkännas.</p>
      </div>
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}

/** Kunden godkänner eller tackar nej på sin offertsida. */
export function CustomerDecision({ token }: { token: string }) {
  const { busy, error, run } = useAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div>
      {declining ? (
        <div className="flex flex-col gap-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Vad skulle behöva ändras? (valfritt)" className="w-full rounded-xl border border-[var(--shop-line)] bg-white p-3 text-[14px]" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => run({ action: "decline", token, reason: reason || undefined })} className="h-11 rounded-full border border-[#1D1D1F] px-5 text-[14px] font-semibold disabled:opacity-50">
              Tacka nej
            </button>
            <button type="button" onClick={() => setDeclining(false)} className="h-11 rounded-full px-4 text-[14px] opacity-70">
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ action: "accept", token })}
            className="h-12 rounded-full bg-[var(--shop-accent)] px-6 text-[15px] font-semibold text-[var(--shop-on-accent)] transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? "Godkänner…" : "Godkänn offerten"}
          </button>
          <button type="button" onClick={() => setDeclining(true)} className="h-12 rounded-full border border-[var(--shop-line)] bg-white px-5 text-[14px] font-medium">
            Tacka nej
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-[13px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}

/** New Wave flyttar ordern genom produktionen. */
export function OrderStep({ id, action, label, dark }: { id: string; action: "produce" | "deliver"; label: string; dark?: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => run({ action, id })}
        className={`h-9 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-transform hover:scale-[1.03] disabled:opacity-50 ${dark ? "bg-[var(--club)] text-white" : "border border-[var(--nw-line)] bg-white text-[var(--nw-ink)]"}`}
      >
        {busy ? "Sparar…" : label}
      </button>
      {error ? <span className="mt-1 text-[12px] text-[#B42318]">{error}</span> : null}
    </span>
  );
}

/** Återförsäljaren justerar en rad i designstudion innan kunden godkänner; priset räknas om på servern. */
export function LineStudio({ quoteId, index, line, markup }: { quoteId: string; index: number; line: QuoteLine; markup: number }) {
  const router = useRouter();
  const save = async (s: Saved) => {
    await call("/api/v1/newwave/quotes", { action: "design", id: quoteId, index, design: s.design, color: s.color, preview: s.mockupUrl, proofs: s.proofs }, "PATCH");
    router.refresh();
  };
  const price = (d: Saved["design"]): [string, string][] => {
    const l = priceLine({ ...line, design: d }, markup);
    return l ? [[`${l.qty} st`, `${sek(l.unit)}/st`], ...(l.setup ? [["Tryckstart", sek(l.setup)] as [string, string]] : []), ["Raden totalt", sek(l.total)]] : [];
  };
  return (
    <StudioButton
      productId={line.productId}
      art={{ light: line.logo, dark: line.logoDark, label: "kundens logga" }}
      initial={line.design}
      color={line.color}
      qty={line.qty}
      price={price}
      onSaved={save}
      saveLabel="Spara på offerten"
      label="Justera design"
      className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--nw-line)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--nw-ink)] transition-colors hover:border-[var(--nw-ink)]"
    />
  );
}
