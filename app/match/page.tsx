"use client";

import Link from "next/link";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import { useState } from "react";

const OPPONENTS = ["AIK", "Malmö FF", "Hammarby", "Djurgården", "BK Häcken", "IF Elfsborg", "Mjällby AIF", "Brommapojkarna", "IK Sirius", "GAIS"];

type Result =
  | { action: "none"; reason: string }
  | { action: "created"; dropId: string; approveUrl: string; ready: number; sms: { to: string; text: string; delivery: string; sentAt: string } };

export default function MatchCentral() {
  const [opponent, setOpponent] = useState("AIK");
  const [goalsFor, setGoalsFor] = useState(2);
  const [goalsAgainst, setGoalsAgainst] = useState(1);
  const [home, setHome] = useState(true);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loader = useLoader();

  const whistle = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    loader.start("Slutsignal! Läser av resultatet", 8, 1500);
    const timers = [
      setTimeout(() => loader.stage("Tar fram motiv efter matchen", 35, 25000), 1200),
      setTimeout(() => loader.stage("Ritar och kontrollerar motiven", 90, 45000), 26000),
      setTimeout(() => loader.stage("Vektoriserar och skickar sms till kansliet", 98, 15000), 70000),
    ];
    try {
      const res = await fetch("/api/v1/webhooks/match-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: "ifk-goteborg", opponent, goalsFor, goalsAgainst, home, notifyTo: phone || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
      setResult(json);
      loader.done();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      timers.forEach(clearTimeout);
      setBusy(false);
    }
  };

  const stepper = (value: number, set: (n: number) => void) => (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => set(Math.max(0, value - 1))} className="h-10 w-10 rounded-full bg-[#F5F5F7] text-lg hover:bg-[#E8E8ED]">
        −
      </button>
      <span className="w-10 text-center font-display text-5xl">{value}</span>
      <button type="button" onClick={() => set(value + 1)} className="h-10 w-10 rounded-full bg-[#F5F5F7] text-lg hover:bg-[#E8E8ED]">
        +
      </button>
    </div>
  );

  return (
    <main className="min-h-screen bg-white">
      <header className="flex h-16 items-center justify-between px-8">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          Craft <span className="font-normal text-[#86868B]">Klubbmerch</span>
        </Link>
        <span className="text-xs font-medium text-[#86868B]">Matchcentral</span>
      </header>

      <div className="mx-auto grid max-w-5xl gap-12 px-6 pb-24 pt-[6vh] lg:grid-cols-[1fr_360px]">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Slutsignal.</h1>
          <p className="mt-3 max-w-md text-[17px] text-[#86868B]">
            I skarp drift kommer resultatet automatiskt från matchdata. Här kan du simulera det. Vid seger – eller poäng i
            ett derby – skapas motiv direkt och kansliet får ett sms.
          </p>

          <div className="mt-10 rounded-3xl border border-[#E8E8ED] p-7">
            <div className="flex items-center justify-between gap-6">
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-[#86868B]">{home ? "Hemma" : "Borta"}</p>
                <p className="mt-1 font-display text-2xl uppercase text-[#234B9A]">IFK Göteborg</p>
                <div className="mt-3 flex justify-center">{stepper(goalsFor, setGoalsFor)}</div>
              </div>
              <span className="font-display text-3xl text-[#C7C7CC]">–</span>
              <div className="text-center">
                <select
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  className="rounded-full bg-[#F5F5F7] px-4 py-2 text-sm font-medium outline-none"
                >
                  {OPPONENTS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <div className="mt-3 flex justify-center">{stepper(goalsAgainst, setGoalsAgainst)}</div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F0F2] pt-5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={home} onChange={(e) => setHome(e.target.checked)} className="h-4 w-4 accent-[#234B9A]" />
                Hemmamatch på Gamla Ullevi
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Mobilnummer (+46…) – valfritt"
                className="h-10 w-60 rounded-full bg-[#F5F5F7] px-4 text-sm outline-none ring-[#234B9A] focus:ring-2"
              />
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={whistle}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1D1D1F] px-8 text-[15px] font-medium text-white hover:bg-black disabled:bg-[#D2D2D7]"
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              {busy ? "Skapar och kontrollerar motiv…" : "Blås av matchen"}
            </button>
            {busy && <p className="mt-3 text-sm text-[#86868B]">Tar cirka en minut: förslag, bilder, bildkontroll och vektorisering.</p>}
            {error && <p className="mt-3 text-sm text-[#B3261E]">{error}</p>}
            {result?.action === "none" && <p className="mt-4 rounded-2xl bg-[#F5F5F7] px-5 py-4 text-sm">{result.reason}</p>}
          </div>
        </div>

        <div className="mx-auto w-[340px]">
          <div className="rounded-[48px] border-[10px] border-[#1D1D1F] bg-[#F2F2F7] p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-6 w-28 rounded-full bg-[#1D1D1F]" />
            <p className="text-center text-xs text-[#86868B]">Meddelanden · Craft Klubbmerch</p>
            <div className="mt-4 min-h-[420px] space-y-3">
              {result?.action === "created" ? (
                <>
                  <p className="text-center text-[11px] text-[#86868B]">
                    {new Date(result.sms.sentAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 text-[14px] leading-snug shadow-sm">
                    {result.sms.text.split(result.approveUrl)[0]}
                    <a href={result.approveUrl} className="break-all text-[#234B9A] underline">
                      Öppna och godkänn
                    </a>
                  </div>
                  <p className="text-center text-[11px] text-[#86868B]">
                    {result.sms.delivery === "twilio" ? `Skickat till ${result.sms.to}` : "Simulerat sms – lägg in Twilio för riktiga utskick"}
                  </p>
                </>
              ) : (
                <p className="pt-32 text-center text-sm text-[#C7C7CC]">Inga meddelanden än</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <IFKLoader state={loader.state} crestUrl="/api/v1/brand/ifk-goteborg/skold-farg.svg" />
    </main>
  );
}
