import { z } from "zod";
import { createConcepts, demoConcepts } from "@/lib/agents";
import { catalogFor } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { isoWeek, weeklySignals } from "@/lib/newwave/club";
import { readCraftRules } from "@/lib/newwave/craftState";
import { withBrand } from "@/lib/newwave/store";
import { errorMessage, generateJson, hasOpenAIKey } from "@/lib/openai";
import { checkConcept, passesAll } from "@/lib/rules";
import type { Club, Concept } from "@/lib/types";

export const maxDuration = 120;

const MOTIFS = 4;
const MIN_SCORE = 7;

const Body = z.object({ clubId: z.string() });

type Score = { brand: number; sales: number; note: string };

async function review(club: Club, concepts: Concept[], signals: string): Promise<Score[]> {
  const out = await generateJson<{ reviews: (Score & { index: number })[] }>({
    system: `Du är två granskare för ${club.name}s veckomaterial.
Varumärkesgranskaren kan klubbens grafiska profil och regelbok, Crafts riktlinjer och Intersports regler:
${club.rules.map((r) => `- ${r}`).join("\n")}
- Tonalitet: ${club.tone}
Säljgranskaren bedömer om en medlem, förälder eller supporter skulle köpa och bära motivet – och om det träffar veckan.
Ge varje motiv brand och sales från 1 till 10. Var sträng: 9–10 bara för det som verkligen sticker ut. note: en mening på svenska om varför, utan att upprepa betygen.`,
    user: `Veckans signaler:\n${signals}\n\nMotiv:\n${concepts.map((c, i) => `${i}. "${c.slogan}" (${c.signal}) – ${c.story}`).join("\n")}`,
    schemaName: "weekly_review",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reviews"],
      properties: {
        reviews: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["index", "brand", "sales", "note"],
            properties: { index: { type: "integer" }, brand: { type: "integer" }, sales: { type: "integer" }, note: { type: "string" } },
          },
        },
      },
    },
  });
  const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
  return concepts.map((_, i) => {
    const r = out.reviews.find((x) => x.index === i);
    return r ? { brand: clamp(r.brand), sales: clamp(r.sales), note: r.note } : { brand: 6, sales: 6, note: "Granskaren hann inte bedöma motivet." };
  });
}

const demoScores = (concepts: Concept[]): Score[] =>
  concepts.map((c, i) => ({ brand: [9, 8, 7, 6][i % 4], sales: [8, 7, 7, 5][i % 4], note: `Träffar ${c.signal.toLowerCase()} och känns som ${c.slogan.length < 20 ? "en tydlig" : "en lite lång"} slogan att bära.` }));

/** Söndagens körning: fyra motiv ur veckans signaler, två granskare, och det med högst sammanlagt betyg vinner. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const listed = CLUBS[parsed.data.clubId];
  if (!listed) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const club = await withBrand(listed);
  const now = new Date();
  const signals = weeklySignals(now);
  const mode = hasOpenAIKey() ? "ai" : "demo";

  try {
    const allowed = new Set((await readCraftRules()).products);
    const catalog = catalogFor(club.id, true).filter((p) => allowed.has(p.id));
    const concepts = mode === "ai" ? await createConcepts(club, signals, MOTIFS, catalog) : demoConcepts(club, signals, MOTIFS);
    const scores = mode === "ai" ? await review(club, concepts, signals.map((s) => `- ${s.title}: ${s.detail}`).join("\n")) : demoScores(concepts);
    const candidates = concepts
      .map((c, i) => ({ ...c, checks: checkConcept(club, c), ...scores[i] }))
      .sort((a, b) => b.brand + b.sales - (a.brand + a.sales));
    const passing = candidates.findIndex((c) => passesAll(c.checks) && c.brand >= MIN_SCORE && c.sales >= MIN_SCORE);
    const picked = passing >= 0 ? passing : Math.max(0, candidates.findIndex((c) => passesAll(c.checks)));
    return Response.json({ mode, week: isoWeek(now), signals, candidates, picked });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
