import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { createScarfIdeas, demoScarfIdeas, reviseScarfIdea } from "@/lib/scarfAgent";
import { IdeaSchema } from "@/lib/scarfFlow";
import { RECIPES, type ScarfIdea } from "@/lib/scarfRecipes";
import { SignalSchema } from "@/lib/schemas";

export const maxDuration = 120;

const Body = z.object({
  clubId: z.string(),
  signals: z.array(SignalSchema).max(30).optional(),
  count: z.number().int().min(1).max(10).optional(),
  /** Granskaren underkände: gör om den här idén med omdömet som underlag. */
  revise: z.object({ idea: IdeaSchema, review: z.object({ summary: z.string().max(600), issues: z.array(z.string().max(300)).max(5) }) }).optional(),
});

const view = (i: ScarfIdea) => ({ ...i, level: RECIPES[i.recipe].level, recipeLabel: RECIPES[i.recipe].label });

/** Språkmodellen svarar oftast på en halv minut, men ibland inte alls. Då ska flödet gå vidare ändå. */
const WAIT_MS = 100_000;
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Språkmodellen svarade inte i tid")), ms))]);

/** Steg 3: agenten föreslår halsdukar. Utan nyckel fylls recepten från klubbens profil i stället. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Signaler saknas" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { signals, revise } = parsed.data;
  const count = parsed.data.count ?? 5;
  try {
    if (revise) {
      const idea = hasOpenAIKey() ? await within(reviseScarfIdea(club, revise.idea, revise.review), WAIT_MS).catch(() => null) : null;
      return Response.json({ mode: "ai", ideas: idea ? [view(idea)] : [] });
    }
    if (!signals?.length) return Response.json({ error: "Signaler saknas" }, { status: 400 });
    if (!hasOpenAIKey()) return Response.json({ mode: "demo", note: "Ingen språkmodell är kopplad, så idéerna är fyllda från klubbens profil och granskaren är avstängd.", ideas: demoScarfIdeas(club, signals, count).map(view) });
    const ideas = await within(createScarfIdeas(club, signals, count), WAIT_MS).catch((err) => {
      console.error("scarf/agent/ideas", errorMessage(err));
      return [] as ScarfIdea[];
    });
    if (ideas.length) return Response.json({ mode: "ai", note: null, ideas: ideas.map(view) });
    return Response.json({ mode: "demo", note: "Språkmodellen svarade inte i tid, så idéerna är fyllda från klubbens profil och granskaren är avstängd. Kör igen om en stund.", ideas: demoScarfIdeas(club, signals, count).map(view) });
  } catch (err) {
    console.error("scarf/agent/ideas", errorMessage(err));
    return Response.json({ error: "Kunde inte ta fram idéer just nu." }, { status: 502 });
  }
}
