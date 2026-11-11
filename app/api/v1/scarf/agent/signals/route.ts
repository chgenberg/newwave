import { hasOpenAIKey } from "@/lib/openai";
import { nearestPantone } from "@/lib/pantone";
import { clubScarfPalette } from "@/lib/scarf";
import { scarfSignals } from "@/lib/scarfAgent";
import { orgSignals, scarfClub } from "@/lib/scarfClub";

export const maxDuration = 60;

/** Steg 1–2 i flödet: klubbens profil för halsdukar och signalerna just nu. `clubId` är en klubb med full profil, `reg:<id>` ur klubbregistret eller `own:<id>` för en egen logga. */
export async function GET(req: Request) {
  const found = await scarfClub(new URL(req.url).searchParams.get("clubId") ?? "");
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { club } = found;
  // Klubbar ur registret och egna loggor har varken matcher eller väderort; de får kalendern och det som är deras eget.
  const { signals, sources } = found.org ? orgSignals(found.org) : await scarfSignals(club);
  return Response.json({
    ai: hasOpenAIKey(),
    club: {
      id: found.ref,
      name: club.name,
      kind: club.kind ?? "club",
      agent: club.agent.name,
      crest: found.crestUrl,
      yarns: clubScarfPalette(club, []).map((hex) => ({ hex, pantone: nearestPantone(hex).code, name: club.palette.find((c) => c.hex.toUpperCase() === hex)?.name ?? (club.kind === "brand" ? "Loggans färg" : "Sköldens färg") })),
      rules: club.rules.filter((r) => !/DTG|digitaltryck/i.test(r)),
    },
    signals,
    sources,
  });
}
