"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApprovalStatus } from "@/lib/newwave/store";

export function ApprovalActions({
  clubId,
  id,
  status,
  note,
  shopCount,
  weekly,
  delivery,
}: {
  clubId: string;
  id: string;
  status: ApprovalStatus;
  note?: string;
  shopCount: number;
  /** Veckans paket: neka ger näst bästa motivet i stället för en ändring. */
  weekly?: boolean;
  /** Produktionsfilerna som gick till New Waves hubb när materialet godkändes. */
  delivery?: { files: number; products: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [published, setPublished] = useState<number | null>(null);

  const decide = async (decision: "godkänd" | "ändring") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/newwave/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, decision, note: decision === "ändring" ? text : undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Något gick fel");
      setPublished(json.published ?? 0);
      setAsking(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === "godkänd") {
    return (
      <div className="mt-6 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white">
        <p className="nw-club-heading text-[18px]">Godkänd</p>
        <p className="mt-1 text-[14px] text-white/70">
          {published ? `${published} produkter ligger nu i klubbens butik. ` : ""}
          {delivery
            ? `${delivery.files} produktionsfiler för ${delivery.products} produkter är skickade till New Waves hubb via API.`
            : published
              ? ""
              : "Materialet är skickat vidare till New Wave via API."}
          {weekly ? " Inläggen, bannern och nyhetsbrevet finns i zip-filen – lägg upp dem när det passar er." : ""}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {shopCount ? (
            <Link href="/newwave/klubb/webshop" className="nw-btn nw-club-btn">
              Se i butiken
            </Link>
          ) : null}
          <Link href="/newwave/craft" className="text-[14px] font-medium text-white underline underline-offset-4">
            Så ser Craft det →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {status === "ändring" && note ? (
        <p className="mb-4 rounded-2xl bg-[var(--nw-soft)] p-4 text-[14px] text-[var(--nw-ink)]">
          <span className="font-medium">{weekly ? "Ni nekade:" : "Ni bad om ändring:"}</span> {note}
        </p>
      ) : null}
      {asking ? (
        <div className="rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4">
          <label htmlFor="note" className="text-[13.5px] font-medium text-[var(--nw-ink)]">
            {weekly ? "Varför passar det inte?" : "Vad ska ändras?"}
          </label>
          <textarea
            id="note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={weekly ? "T.ex. för likt förra veckan, eller fel sektion" : "T.ex. mer gult, nämn innebandyn också"}
            className="mt-2 w-full resize-none rounded-xl bg-[var(--nw-soft)] p-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="nw-btn" disabled={busy || text.trim().length < 3} onClick={() => decide("ändring")}>
              {weekly ? "Neka" : "Skicka till agenten"}
            </button>
            <button type="button" className="nw-btn nw-btn-ghost" onClick={() => setAsking(false)}>
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="nw-btn nw-club-btn" disabled={busy} onClick={() => decide("godkänd")}>
            {busy ? "Godkänner…" : shopCount ? "Godkänn och lägg i butiken" : "Godkänn"}
          </button>
          <button type="button" className="nw-btn nw-btn-ghost" disabled={busy} onClick={() => setAsking(true)}>
            {weekly ? "Neka med motivering" : "Begär ändring"}
          </button>
        </div>
      )}
      {error ? <p className="mt-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
    </div>
  );
}
