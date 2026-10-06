import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LogoResult } from "./logo";

export type SiteAnalysis = {
  id: string;
  host: string;
  createdAt: string;
  brandName: string;
  industry: string;
  industryEn: string;
  offering: string;
  offeringEn: string;
  tone: string;
  tagline: string;
  brandColor: string | null;
  scene: { screen: string; rollup: string; counter: string; shelves: string; staff: string; materials: string; lighting: string };
  images: { url: string; hash: string; caption: string; description: string; selected: boolean }[];
  merch: { id: string; reason: string }[];
  logo: { status: "ok" | "replaced" | "wordmark"; note: string; result: LogoResult | null };
  timings: { scrapeMs: number; analyzeMs: number };
};

export const ANALYSIS_ID = /^[0-9a-f]{20}$/;
export const SITE_CACHE = path.join(process.cwd(), ".data", "demo", "sites");

/** Analyses are only ever written by the server, so the booth prompt can trust their (already sanitised) fields. */
export async function readAnalysis(id: string): Promise<SiteAnalysis | null> {
  if (!ANALYSIS_ID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(SITE_CACHE, `${id}.json`), "utf8")) as SiteAnalysis;
  } catch {
    return null;
  }
}
