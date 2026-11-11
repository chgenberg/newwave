import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { drawScarfMotif } from "@/lib/scarfAgent";
import { ART_FILE, IdeaSchema, knitIdea, previews } from "@/lib/scarfFlow";
import { saveFile } from "@/lib/store";

export const maxDuration = 180;

const Body = z.object({ clubId: z.string(), idea: IdeaSchema, artFile: z.string().regex(ART_FILE).nullable().optional() });

/** Steg 4–5: idén blir maskor, och maskinkontrollen körs. Receptet "motiv" låter först bildmodellen rita motivet. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig idé" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { idea } = parsed.data;
  try {
    let artFile = parsed.data.artFile ?? null;
    let artNote: string | null = null;
    if (!artFile && idea.recipe === "motiv" && idea.art && hasOpenAIKey()) {
      try {
        artFile = (await saveFile(await drawScarfMotif(idea, { ink: idea.colors.ink, accent: idea.colors.accent, ground: idea.colors.ground }), "png")).id;
      } catch (err) {
        console.error("scarf/agent/knit motif", errorMessage(err));
        artNote = "Bildmodellen kunde inte rita motivet – halsduken fick en ikon i stället.";
      }
    }
    const { built, knit, report, front, back } = await knitIdea(club, idea, { artFile });
    return Response.json({
      palette: knit.palette,
      report,
      images: await previews(knit),
      text: { front, back },
      consent: built.consent,
      artFile: built.uses.art ? artFile : null,
      artNote,
      minTextMm: knit.minTextMm,
    });
  } catch (err) {
    console.error("scarf/agent/knit", errorMessage(err));
    return Response.json({ error: "Kunde inte sticka halsduken." }, { status: 500 });
  }
}
