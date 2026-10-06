"use client";

import { useEffect, useState } from "react";
import { sek } from "@/lib/demoCatalog";
import { delivery, deliveryText, fmtDay, visitorsLabel } from "@/lib/demoPackages";
import type { Share } from "@/lib/demoShare";
import { Icons, Primary, Secondary, TrustLine } from "./parts";

export const OWNED_KEY = "demo-shares";

const ownedIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(OWNED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const STATUS: Record<Share["status"], [string, string]> = {
  pending: ["Väntar på godkännande", "bg-[#F5F5F7] text-[#424245]"],
  approved: ["Godkänd", "bg-[#E8F5EC] text-[#1E6B34]"],
  commented: ["Kommenterad", "bg-[#FFF4E5] text-[#8A4B00]"],
};

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ApprovalView({ initial }: { initial: Share }) {
  const [share, setShare] = useState(initial);
  const [owner, setOwner] = useState(false);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "comment" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setOwner(ownedIds().includes(initial.id)), 0);
    return () => clearTimeout(t);
  }, [initial.id]);

  /** The requester keeps the page open while the colleague decides. */
  useEffect(() => {
    if (!owner) return;
    const refresh = () =>
      fetch(`/api/v1/demo/share/${initial.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Share | null) => s && setShare(s))
        .catch(() => {});
    const t = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [owner, initial.id]);

  const act = async (action: "approve" | "comment") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/v1/demo/share/${share.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: name.trim(), comment: comment.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
      setShare(json as Share);
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const d = delivery(share.eventDate, share.lines.map((l) => l.id), new Date(share.createdAt));
  const [label, tone] = STATUS[share.status];
  const facts = [
    share.eventDate && ["Mässdatum", fmtDay(share.eventDate)],
    share.visitors && ["Besökare", `ca ${visitorsLabel(share.visitors).toLowerCase()}`],
    share.reference && ["Referens", `#${share.reference}`],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="min-h-screen bg-white text-[#1D1D1F]">
      <header className="border-b border-black/[0.06]">
        <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between px-5 sm:px-8">
          <span className="text-[15px] font-semibold tracking-[0.16em]">{share.brand.name.toUpperCase()}</span>
          <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${tone}`}>{label}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.022em] sm:text-[40px]">{owner ? "Din offert" : "Godkänn offert"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6E6E73]">
          {owner ? "Du ser här när din kollega har svarat." : `Mässmonter och profilprodukter för ${share.brand.name}. Godkänn eller lämna en kommentar.`}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        {share.boothUrl && <img src={share.boothUrl} alt={`Mässmonter för ${share.brand.name}`} className="mt-6 aspect-[3/2] w-full rounded-2xl object-cover" />}

        <ul className="mt-6 divide-y divide-black/[0.06] border-y border-black/[0.06]">
          {share.lines.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">{l.name}</p>
                <p className="truncate text-[13px] text-[#6E6E73]">
                  {l.qty.toLocaleString("sv-SE").replace(/\u00a0/g, " ")} {l.unit} · {l.spec}
                </p>
              </div>
              <p className="shrink-0 text-[14px] font-semibold tabular-nums">{sek(l.totalSek)}</p>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between py-4">
          <p className="text-[15px] font-medium">
            Totalt <span className="text-[13px] font-normal text-[#6E6E73]">exkl. moms</span>
          </p>
          <p className="text-[22px] font-semibold tabular-nums">{sek(share.totalSek)}</p>
        </div>

        <div className="space-y-2 rounded-2xl bg-[#F5F5F7] p-4 text-[13px]">
          {facts.map(([k, v]) => (
            <p key={k} className="flex justify-between gap-4">
              <span className="text-[#6E6E73]">{k}</span>
              <span className="font-medium">{v}</span>
            </p>
          ))}
          <p className={`flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 ${d?.late ? "text-[#B54708]" : "text-[#424245]"}`}>
            {Icons.calendar} {d ? deliveryText(d) : "Leveransdatum bekräftas tillsammans med korrekturen."}
          </p>
        </div>
        <TrustLine className="mt-4" />

        {share.events.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[17px] font-semibold">Svar</h2>
            <ul className="mt-3 space-y-3">
              {share.events.map((e, i) => (
                <li key={i} className="rounded-2xl border border-black/[0.08] p-4">
                  <p className="text-[13px] text-[#6E6E73]">
                    <span className="font-medium text-[#1D1D1F]">{e.name || "En kollega"}</span> · {e.action === "approve" ? "godkände" : "kommenterade"} · {when(e.at)}
                  </p>
                  {e.comment && <p className="mt-1.5 whitespace-pre-wrap text-[15px]">{e.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!owner && (
          <section className="mt-8">
            <label className="block">
              <span className="text-[13px] font-medium">Ditt namn (valfritt)</span>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 text-[15px] outline-none transition focus:border-[#1D1D1F]" />
            </label>
            <label className="mt-3 block">
              <span className="text-[13px] font-medium">Kommentera</span>
              <textarea
                value={comment}
                maxLength={1000}
                rows={3}
                onChange={(e) => setComment(e.target.value)}
                placeholder="T.ex. fler pennor, eller vänta med beachflaggan"
                className="mt-1.5 w-full resize-y rounded-xl border border-black/15 bg-white px-4 py-3 text-[15px] outline-none transition placeholder:text-[#AEAEB2] focus:border-[#1D1D1F]"
              />
            </label>
            {error && <p className="mt-2 text-[13px] text-[#B42318]">{error}</p>}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Primary onClick={() => act("approve")} loading={busy === "approve"} disabled={busy !== null || share.status === "approved"}>
                {Icons.check} {share.status === "approved" ? "Godkänd" : "Godkänn"}
              </Primary>
              <Secondary onClick={() => act("comment")} disabled={busy !== null || !comment.trim()}>
                Skicka kommentar
              </Secondary>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
