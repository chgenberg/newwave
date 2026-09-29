import { artworkPrompt, demoArtworkSvg } from "./agents";
import { analyzePalette, paletteChecks, visionReview } from "./imagecheck";
import { IMAGE_MODEL, generateTransparentPng, hasOpenAIKey } from "./openai";
import { allowedPalette } from "./rules";
import { saveFile } from "./store";
import type { Club, Concept, RuleCheck } from "./types";
import { vectorizeToPalette } from "./vectorize";

const MAX_ATTEMPTS = 3;

const FIXES: Record<string, string> = {
  "Bilden håller klubbens färger": "Use ONLY the listed colours – no other hues, no shading into other colours.",
  "Inga spärrade färger i bilden": "Remove every trace of green, red and yellow.",
  "Satir: motståndarfärger högst en tredjedel": "The rival colours may only be a small joke element – at most a third of the motif; the club colours must dominate.",
  "Motivet är stort nog för tryck": "Make the motif much larger and bolder – it must fill at least 60% of the canvas.",
  "Luft mot kanterna": "Keep a clear empty margin on all sides; nothing may touch the edges.",
  "Ingen text i illustrationen": "Remove all letters, numbers and text.",
  "Ingen egen logga eller sköld": "Do not draw any shield, crest or logo shape.",
  "Liknar inget annat varumärke eller figur": "Make it original – it must not resemble any brand, club symbol or known character.",
  "Inga verkliga personer": "Do not depict any real or recognisable person.",
  "Tryckbart med DTG": "Use thicker lines and larger, simpler shapes that survive textile printing.",
};

export type ArtworkResult = {
  mode: "ai" | "demo";
  url: string;
  rasterUrl: string;
  prompt: string;
  model: string;
  attempts: number;
  passed: boolean;
  imageChecks: RuleCheck[];
  colorsUsed: string[];
};

export async function produceArtwork(club: Club, concept: Concept, feedback?: string): Promise<ArtworkResult> {
  const basePrompt = `${artworkPrompt(club, concept)}${feedback ? `\n\nArt director feedback on an earlier version – improve on this: ${feedback}` : ""}`;

  if (!hasOpenAIKey()) {
    const file = await saveFile(demoArtworkSvg(club, concept), "svg");
    return {
      mode: "demo",
      url: file.url,
      rasterUrl: file.url,
      prompt: basePrompt,
      model: "demo",
      attempts: 1,
      passed: true,
      imageChecks: [{ rule: "Bildkontroll (demoläge)", ok: true }],
      colorsUsed: concept.palette,
    };
  }

  let prompt = basePrompt;
  let png: Buffer | null = null;
  let checks: RuleCheck[] = [];
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    png = await generateTransparentPng(prompt);
    const [palette, vision] = await Promise.all([
      analyzePalette(png, club, concept.mode).then(paletteChecks),
      visionReview(png, club),
    ]);
    checks = [...palette, ...vision];
    const failed = checks.filter((c) => !c.ok);
    if (failed.length === 0) break;
    const fixes = failed.map((f) => FIXES[f.rule] ?? `${f.rule}${f.note ? ` (${f.note})` : ""}`);
    prompt = `${basePrompt}\n\nThe previous attempt was rejected by the club's brand rules. Fix the following: ${fixes.join(" ")}`;
  }

  const [{ svg, colorsUsed }, raster] = await Promise.all([
    vectorizeToPalette(png!, allowedPalette(club, concept).map((c) => c.hex)),
    saveFile(png!, "png"),
  ]);
  const vector = await saveFile(svg, "svg");

  return {
    mode: "ai",
    url: vector.url,
    rasterUrl: raster.url,
    prompt,
    model: IMAGE_MODEL,
    attempts,
    passed: checks.every((c) => c.ok),
    imageChecks: [
      ...checks,
      { rule: "Vektoriserad i enbart klubbens färger", ok: true, note: `${colorsUsed.length} färger, skalbar till valfri storlek` },
    ],
    colorsUsed,
  };
}
