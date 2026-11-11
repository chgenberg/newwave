"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ScarfParts";
import { registryAsset } from "@/lib/newwave/clubAssets";
import type { ScarfPick } from "@/lib/scarfClub";

/** Det som räcker för att visa ett val i listan; resten av profilen hämtas när klubben är vald. */
export type PickLite = Pick<ScarfPick, "ref" | "name" | "sub" | "crest"> & { dark?: boolean };

type RegistryRow = { id: string; name: string; municipality: string; sport: string; at?: string; onDark?: boolean };

function Crest({ src, dark, size = 40 }: { src: string; dark?: boolean; size?: number }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl ${dark ? "bg-[#1D1D1F]" : "bg-[#F5F5F7]"}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="object-contain" style={{ maxWidth: size - 10, maxHeight: size - 10 }} loading="lazy" />
    </span>
  );
}

/** Väljer vem halsdukarna görs för: klubbarna med full profil, vilken klubb som helst ur registret eller en egen logga. */
export function ClubPicker({ current, featured, own, onPick, onUpload, onClose }: { current: string; featured: PickLite[]; own: PickLite | null; onPick: (p: PickLite) => void; onUpload: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickLite[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // Sökningen väntar en kort stund efter senaste tangenten. Tom sökruta visar de största klubbarna.
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      fetch(`/api/v1/newwave/registry?q=${encodeURIComponent(q.trim())}&limit=8&sort=size`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("registret"))))
        .then((d: { total: number; items: RegistryRow[] }) => {
          if (!live) return;
          setRows(d.items.map((c) => ({ ref: `reg:${c.id}`, name: c.name, sub: [c.sport, c.municipality].filter(Boolean).join(" · "), crest: registryAsset(c.id, c.at, "logo.png"), dark: c.onDark })));
          setTotal(d.total);
        })
        .catch(() => live && setMissing(true));
    }, 180);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  const top = [...(own ? [own] : []), ...featured].filter((p) => !q.trim() || p.name.toLocaleLowerCase("sv-SE").includes(q.trim().toLocaleLowerCase("sv-SE")));
  const row = (p: PickLite) => (
    <li key={p.ref}>
      <button type="button" onClick={() => onPick(p)} className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition hover:bg-[#F5F5F7] ${p.ref === current ? "bg-[#F5F5F7]" : ""}`}>
        <Crest src={p.crest} dark={p.dark} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{p.name}</span>
          {p.sub && <span className="block truncate text-[12.5px] text-[#86868B]">{p.sub}</span>}
        </span>
        {p.ref === current && <span className="text-[12px] font-medium text-[#1E8E3E]">Vald</span>}
      </button>
    </li>
  );

  return (
    <Modal title="Vem är halsduken till?" onClose={onClose}>
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Sök din klubb"
        aria-label="Sök din klubb"
        className="h-12 w-full rounded-2xl bg-[#F5F5F7] px-4 text-[16px] outline-none placeholder:text-[#86868B] focus:ring-2 focus:ring-[#1D1D1F]"
      />
      <ul className="mt-3 space-y-0.5">
        {top.map(row)}
        {rows.filter((r) => !top.some((t) => t.name === r.name)).map(row)}
      </ul>
      {!missing && total !== null && rows.length === 0 && top.length === 0 && <p className="mt-2 px-2.5 text-[13.5px] text-[#86868B]">Ingen klubb med det namnet. Ladda upp loggan i stället.</p>}
      {!missing && total !== null && total > rows.length && rows.length > 0 && <p className="mt-2 px-2.5 text-[12.5px] text-[#86868B]">{total.toLocaleString("sv-SE")} klubbar – skriv mer för att hitta rätt.</p>}
      <button type="button" onClick={onUpload} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-black/20 px-2.5 py-2.5 text-left transition hover:border-black/50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F5F7]">
          <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
        </span>
        <span>
          <span className="block text-[15px] font-medium">Ladda upp en egen logga</span>
          <span className="block text-[12.5px] text-[#86868B]">Klubb, företag eller förening – färgerna läses ur loggan.</span>
        </span>
      </button>
    </Modal>
  );
}

const FIELD = "h-12 w-full rounded-2xl bg-[#F5F5F7] px-4 text-[16px] outline-none placeholder:text-[#86868B] focus:ring-2 focus:ring-[#1D1D1F]";

/** En uppladdad logga får ett namn och blir den klubb som flödet körs för. */
export function OwnLogoDialog({ logo, onDone, onClose }: { logo: string; onDone: (p: ScarfPick) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"klubb" | "foretag">("klubb");
  const [what, setWhat] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/scarf/agent/club", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind, what, city, logo }) });
      const json = (await res.json().catch(() => ({}))) as ScarfPick & { error?: string };
      if (!res.ok) throw new Error(json.error || "Kunde inte spara loggan.");
      onDone(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara loggan.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Vems logga är det?" onClose={busy ? () => undefined : onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[repeating-conic-gradient(#ECECEF_0_25%,#F8F8FA_0_50%)] bg-[length:16px_16px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="max-h-16 max-w-16 object-contain" />
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Namnet som ska stå på halsduken" aria-label="Namn" className={FIELD} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-[#F5F5F7] p-1" role="group" aria-label="Typ">
          {(
            [
              ["klubb", "Klubb eller förening"],
              ["foretag", "Företag"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={`h-10 rounded-xl text-[14px] font-medium transition ${kind === id ? "bg-white shadow-sm" : "text-[#6E6E73]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={40} placeholder={kind === "klubb" ? "Sport, t.ex. Fotboll" : "Vad ni gör, t.ex. Kafé"} aria-label={kind === "klubb" ? "Sport" : "Verksamhet"} className={FIELD} />
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={40} placeholder="Ort" aria-label="Ort" className={FIELD} />
        </div>
        {error && <p className="mt-3 rounded-2xl bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#B3261E]">{error}</p>}
        <button type="submit" disabled={!name.trim() || busy} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#1D1D1F] px-6 text-[15px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]">
          {busy ? "Läser färgerna ur loggan …" : "Använd loggan"}
        </button>
      </form>
    </Modal>
  );
}
