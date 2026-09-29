import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { validatePersonalization } from "@/lib/personalize";

const Body = z.object({ clubId: z.string(), name: z.string().max(40), number: z.string().max(4) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, reason: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ ok: false, reason: "Okänd klubb" }, { status: 404 });
  return Response.json(validatePersonalization(club, parsed.data.name, parsed.data.number));
}
