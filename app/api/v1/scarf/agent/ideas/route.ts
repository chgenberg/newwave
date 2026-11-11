import { z } from "zod";
import { cleanText } from "@/lib/demoLimit";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { changeScarfIdea, createScarfIdeas, demoScarfIdeas, reviseScarfIdea } from "@/lib/scarfAgent";
import { scarfClub, withoutYears } from "@/lib/scarfClub";
import { IdeaSchema } from "@/lib/scarfFlow";
import { scarfLimit } from "@/lib/scarfLimit";
import { RECIPES, type RecipeId, type ScarfIdea } from "@/lib/scarfRecipes";
import { BRAND_WISHES, WISHES, WISH_IDS, WISH_MAX } from "@/lib/scarfWishes";
import { SignalSchema } from "@/lib/schemas";
import type { Signal } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({
  clubId: z.string().max(120),
  signals: z.array(SignalSchema).max(30).optional(),
  count: z.number().int().min(1).max(10).optional(),
  /** Det beställaren bett om: typer av halsdukar och en egen önskan i fri text. */
  want: z.array(z.enum(WISH_IDS)).max(WISH_IDS.length).optional(),
  wish: z.string().max(200).optional(),
  /** Granskaren underkände: gör om den här idén med omdömet som underlag. */
  revise: z.object({ idea: IdeaSchema, review: z.object({ summary: z.string().max(600), issues: z.array(z.string().max(300)).max(5) }) }).optional(),
  /** Beställaren vill ändra en färdig halsduk med egna ord. */
  change: z.object({ idea: IdeaSchema, instruction: z.string().min(1).max(300) }).optional(),
});

const view = (i: ScarfIdea) => ({ ...i, level: RECIPES[i.recipe].level, recipeLabel: RECIPES[i.recipe].label });

/** Språkmodellen svarar oftast på en halv minut, men ibland inte alls. Då ska flödet gå vidare ändå. */
const WAIT_MS = 100_000;
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Språkmodellen svarade inte i tid")), ms))]);

/** Steg 3: agenten föreslår halsdukar. Utan nyckel fylls recepten från klubbens profil i stället. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Signaler saknas" }, { status: 400 });
  const { signals, revise, change } = parsed.data;
  const limited = scarfLimit(req, revise || change ? "redo" : "run");
  if (limited) return limited;
  const found = await scarfClub(parsed.data.clubId);
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { club } = found;
  // Utan känt grundningsår får inga gamla årtal stå på halsduken, även om modellen hittar på ett.
  const tidy = (i: ScarfIdea) => view(withoutYears(i, club.founded || undefined));
  try {
    if (revise || change) {
      const redo = revise ? reviseScarfIdea(club, revise.idea, revise.review) : changeScarfIdea(club, change!.idea, cleanText(change!.instruction, 240));
      const idea = hasOpenAIKey() ? await within(redo, WAIT_MS).catch(() => null) : null;
      return Response.json({ mode: "ai", ideas: idea ? [tidy(idea)] : [] });
    }
    if (!signals?.length) return Response.json({ error: "Signaler saknas" }, { status: 400 });

    const brand = club.kind === "brand";
    const wishes = WISHES.filter((w) => parsed.data.want?.includes(w.id) && (!brand || BRAND_WISHES.includes(w.id)));
    const want = [...new Set(wishes.map((w) => w.recipe as RecipeId))];
    const notes = Object.fromEntries(wishes.filter((w) => w.note).map((w) => [w.recipe, w.note]));
    const wish = cleanText(parsed.data.wish ?? "", WISH_MAX);
    // Varje önskemål ska få sin halsduk, även om det är fler än det valda antalet.
    const count = Math.min(10, Math.max(parsed.data.count ?? 5, want.length));
    // Den fria önskan blir en egen signal, så att idén kan peka på den.
    const all: Signal[] = wish && !signals.some((s) => s.title === wish) ? [{ id: "wish", kind: "custom", title: wish, detail: "Beställarens egen önskan." }, ...signals] : signals;

    const demo = (note: string) => Response.json({ mode: "demo", note, signals: all, ideas: demoScarfIdeas(club, all, count, want).map(tidy) });
    if (!hasOpenAIKey()) return demo("Ingen språkmodell är kopplad, så idéerna är fyllda från klubbens profil och granskaren är avstängd.");
    const ideas = await within(createScarfIdeas(club, all, count, [], want, { notes, wish: wish || undefined }), WAIT_MS).catch((err) => {
      console.error("scarf/agent/ideas", errorMessage(err));
      return [] as ScarfIdea[];
    });
    if (ideas.length) return Response.json({ mode: "ai", note: null, signals: all, ideas: ideas.map(tidy) });
    return demo("Språkmodellen svarade inte i tid, så idéerna är fyllda från klubbens profil och granskaren är avstängd. Kör igen om en stund.");
  } catch (err) {
    console.error("scarf/agent/ideas", errorMessage(err));
    return Response.json({ error: "Kunde inte ta fram idéer just nu." }, { status: 502 });
  }
}
