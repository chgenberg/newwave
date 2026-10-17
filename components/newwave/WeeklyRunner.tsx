"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLoader } from "@/components/IFKLoader";
import { ClubLoader } from "@/components/newwave/ClubLoader";
import { makeAssets, makeMaterial, post, takePhotos } from "@/lib/newwave/buildPack";
import type { WeeklyCandidate, WeeklyRun } from "@/lib/newwave/store";
import type { Concept, RuleCheck, Signal } from "@/lib/types";

type Planned = Concept & { checks: RuleCheck[]; brand: number; sales: number; note: string };
type Plan = { week: number; signals: Signal[]; candidates: Planned[]; picked: number };

const conceptOf = (c: Planned): Concept => ({
  id: c.id,
  signal: c.signal,
  mode: c.mode,
  title: c.title,
  slogan: c.slogan,
  story: c.story,
  style: c.style,
  artDirection: c.artDirection,
  palette: c.palette,
  products: c.products,
});

/** Söndagens körning på knapptryck: fyra motiv, två granskare, och vinnaren som komplett paket. */
export function WeeklyRunner({
  clubId,
  footer,
  primary,
  accent,
  shopName,
  signals,
  loaderLines,
  loaderDone,
  label,
  retry,
  ghost,
}: {
  clubId: string;
  footer: string;
  primary: string;
  accent: string;
  shopName: string;
  signals: Signal[];
  loaderLines?: string[];
  loaderDone?: string;
  label: string;
  /** Förra körningen; då görs nästa motiv i listan i stället för fyra nya. */
  retry?: WeeklyRun & { next: number };
  ghost?: boolean;
}) {
  const loader = useLoader();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      let week: number;
      let candidates: WeeklyCandidate[];
      let picked: number;
      let titles: string[];
      if (retry) {
        loader.start(`Tar fram näst bästa motivet: ${retry.candidates[retry.next].concept.slogan}`, 20, 3000);
        ({ week, candidates, signals: titles } = retry);
        picked = retry.next;
      } else {
        loader.start("Agenten läser veckans signaler och tar fram fyra motiv", 18, 30000);
        const plan = await post<Plan>("/api/v1/newwave/weekly", { clubId });
        week = plan.week;
        picked = plan.picked;
        titles = plan.signals.map((s) => s.title);
        candidates = plan.candidates.map((c) => ({ concept: conceptOf(c), brand: c.brand, sales: c.sales, note: c.note }));
        loader.stage(`Granskarna valde "${candidates[picked].concept.slogan}" av ${candidates.length}`, 22, 1500);
      }
      const concept = candidates[picked].concept;
      const signal = signals.find((s) => s.title === concept.signal) ?? { id: "weekly", kind: "club", title: concept.signal, detail: concept.story };
      const made = await makeMaterial({ clubId, concept, signal, footer, primary, stage: (l, p, ms) => loader.stage(l, 20 + p * 0.5, ms) });
      loader.stage("Bygger inlägg, story, banner och affisch – och fotograferar", 96, 110000);
      const [assets, photos] = await Promise.all([makeAssets({ made, primary, accent, shopName }), takePhotos(clubId, concept, made.printFiles)]);
      await post("/api/v1/newwave/approvals", {
        clubId,
        concept,
        previewUrl: made.printFiles.light,
        printFiles: made.printFiles,
        mockups: made.mockups,
        content: { instagram: made.content.instagram, facebook: made.content.facebook, newsletter: made.content.newsletter, banner: made.content.banner, tiktok: made.content.tiktok, plan: made.content.plan },
        assets,
        photos,
        shopUrl: made.shopUrl,
        weekly: { week, signals: titles, candidates, picked },
      });
      loader.done();
      router.refresh();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ClubLoader state={loader.state} crestUrl={`/api/v1/brand/${clubId}/skold-farg.png`} lines={loaderLines} doneLine={loaderDone} wide />
      <button type="button" className={`nw-btn ${ghost ? "nw-btn-ghost" : "nw-club-btn"}`} disabled={busy} onClick={run}>
        {busy ? "Agenten jobbar…" : label}
      </button>
      {error ? <p className="mt-3 text-[13.5px] text-[#B42318]">{error}</p> : null}
    </>
  );
}
