"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sek } from "./format";

/**
 * Det Craft gör med ett utkast: laddar ner innehållspaketet, kopierar mejlet till sitt eget e-postprogram och
 * markerar det som skickat. Inget mejl skickas härifrån. "Skriv om med AI" anropar språkmodellen, bara på knapptryck.
 */
export function DraftActions({ id, zip, mail, status, aiSek, rewritten }: { id: string; zip: string; mail: string; status: "utkast" | "skickat"; aiSek: number; rewritten?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "status" | "ai">("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mail);
      setMessage({ text: "Mejlet är kopierat – klistra in det i ditt e-postprogram och bifoga paketet." });
    } catch {
      setMessage({ text: "Kunde inte kopiera. Markera texten och kopiera den själv.", error: true });
    }
  };

  const call = async (kind: "status" | "ai") => {
    setBusy(kind);
    setMessage(null);
    try {
      const res =
        kind === "status"
          ? await fetch(`/api/v1/craft/innehall/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status === "skickat" ? "utkast" : "skickat" }) })
          : await fetch(`/api/v1/craft/innehall/${id}/ai`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; costSek?: number };
      if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
      if (kind === "ai") setMessage({ text: `Texterna är omskrivna. Kostnad: ${sek(json.costSek ?? 0)}.` });
      router.refresh();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Något gick fel.", error: true });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={zip} download className="nw-btn">
          Ladda ner innehållspaketet
        </a>
        <button type="button" onClick={copy} className="nw-btn nw-btn-ghost">
          Kopiera mejlet
        </button>
        <button type="button" disabled={!!busy} onClick={() => call("status")} className="nw-btn nw-btn-ghost disabled:opacity-50">
          {busy === "status" ? "Sparar…" : status === "skickat" ? "Markera som utkast" : "Markera som skickat"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => call("ai")} className="nw-btn nw-btn-ghost disabled:opacity-50" title="Texterna till Instagram, Facebook och nyhetsbrevet skrivs om av gpt-5-mini">
          {busy === "ai" ? "Skriver om…" : `Skriv om med AI · ca ${sek(aiSek)}`}
        </button>
      </div>
      {rewritten !== undefined && !message ? <p className="text-[12.5px] text-[var(--nw-muted)]">Texterna är omskrivna med AI ({sek(rewritten)}).</p> : null}
      {message ? (
        <p role="status" className={`text-[13px] ${message.error ? "text-[#9B1C1C]" : "text-[#1E6B34]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Skapar innehåll och mejlutkast för en publicerad design, i omgångar om 250 klubbar. */
export function CreateDrafts({ designs }: { designs: { id: string; name: string; clubIds: string[] }[] }) {
  const router = useRouter();
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [progress, setProgress] = useState<string>("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  if (!designs.length) return null;
  const design = designs.find((d) => d.id === designId);

  const run = async () => {
    if (!design) return;
    setMessage(null);
    let drafts = 0;
    let noEmail = 0;
    try {
      for (let i = 0; i < design.clubIds.length; i += 250) {
        setProgress(`${Math.min(i + 250, design.clubIds.length)} av ${design.clubIds.length} klubbar…`);
        const res = await fetch("/api/v1/craft/innehall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: design.id, clubIds: design.clubIds.slice(i, i + 250) }) });
        const json = (await res.json().catch(() => ({}))) as { drafts?: number; missingEmail?: number; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Kunde inte skapa utkasten.");
        drafts += json.drafts ?? 0;
        noEmail += json.missingEmail ?? 0;
      }
      setMessage({ text: `${drafts} utkast klara${noEmail ? `, ${noEmail} utan e-post i registret` : ""}.` });
      router.push(`/newwave/craft/utskick?design=${encodeURIComponent(design.id)}`);
      router.refresh();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Kunde inte skapa utkasten.", error: true });
    } finally {
      setProgress("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-[420px]">
          <span className="sr-only">Publicerad design</span>
          <select
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
            className="h-10 w-full appearance-none truncate rounded-full bg-[var(--nw-soft)] pl-4 pr-9 text-[14px] font-medium text-[var(--nw-ink)] outline-none focus:ring-2 focus:ring-[var(--club)]"
          >
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.clubIds.length} {d.clubIds.length === 1 ? "klubb" : "klubbar"}
              </option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--nw-muted)]" aria-hidden>
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <button type="button" disabled={!!progress || !design} onClick={run} className="nw-btn shrink-0 disabled:opacity-50">
          {progress ? `Skapar… ${progress}` : "Skapa innehåll och mejlutkast"}
        </button>
      </div>
      {message ? (
        <p role="status" className={`text-[13px] ${message.error ? "text-[#9B1C1C]" : "text-[#1E6B34]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
