import { CLUBS } from "@/lib/club";
import { hasOpenAIKey } from "@/lib/openai";
import { scarfSignals } from "@/lib/scarfAgent";
import { clubScarfPalette } from "@/lib/scarf";
import { nearestPantone } from "@/lib/pantone";

export const maxDuration = 60;

/** Steg 1–2 i flödet: klubbens profil för halsdukar och signalerna just nu. */
export async function GET(req: Request) {
  const club = CLUBS[new URL(req.url).searchParams.get("clubId") ?? ""];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { signals, sources } = await scarfSignals(club);
  return Response.json({
    ai: hasOpenAIKey(),
    club: {
      id: club.id,
      name: club.name,
      kind: club.kind ?? "club",
      agent: club.agent.name,
      crest: `/api/v1/brand/${club.id}/${club.brand.crest.farg}`,
      yarns: clubScarfPalette(club, []).map((hex) => ({ hex, pantone: nearestPantone(hex).code, name: club.palette.find((c) => c.hex.toUpperCase() === hex)?.name ?? (club.kind === "brand" ? "Loggans färg" : "Sköldens färg") })),
      rules: club.rules.filter((r) => !/DTG|digitaltryck/i.test(r)),
    },
    signals,
    sources,
  });
}
