"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readDemo, writeDemo } from "./DemoBar";
import { DEMO_STEPS, type DemoState } from "./steps";

/** Startar den guidade demon: en inloggning för alla roller, sedan första steget. Kan också fortsätta en påbörjad demo. */
export function DemoStart({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<DemoState | null>(null);

  useEffect(() => {
    const sync = () => setSaved(readDemo());
    sync();
  }, []);

  async function start(resume: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/poc/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", ...(loggedIn ? {} : { password }) }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Demon gick inte att starta.");
      const state: DemoState = resume && saved ? saved : { step: 0, startedAt: new Date().toISOString() };
      writeDemo(state);
      router.push(DEMO_STEPS[state.step].url(state));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demon gick inte att starta.");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void start(false);
      }}
      className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center"
    >
      {!loggedIn && (
        <label className="flex-1 sm:max-w-[320px]">
          <span className="sr-only">Crafts lösenord</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crafts lösenord" className="h-12 w-full rounded-full bg-[#F2F1EE] px-5 text-[15px] outline-none ring-[#111] focus:ring-2" />
        </label>
      )}
      <button type="submit" disabled={busy} className="h-12 rounded-full bg-[#111] px-6 text-[15px] font-semibold text-white transition hover:bg-[#333] disabled:opacity-60">
        {busy ? "Startar …" : "Starta demon"}
      </button>
      {saved && saved.step > 0 && (
        <button type="button" disabled={busy} onClick={() => void start(true)} className="h-12 rounded-full px-5 text-[14px] font-medium text-[#111] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.2)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.5)]">
          Fortsätt på steg {saved.step + 1}
        </button>
      )}
      {error && <p className="text-[13.5px] text-[#9B1C1C] sm:ml-2">{error}</p>}
    </form>
  );
}
