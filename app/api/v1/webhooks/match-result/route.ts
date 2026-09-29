import { z } from "zod";
import { createConcepts, demoConcepts } from "@/lib/agents";
import { produceArtwork } from "@/lib/artwork";
import { CLUBS } from "@/lib/club";
import { publicOrigin } from "@/lib/origin";
import { saveDrop } from "@/lib/drops";
import { sendSms } from "@/lib/notify";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { checkConcept, passesAll } from "@/lib/rules";
import type { Signal } from "@/lib/types";

export const maxDuration = 300;

const RIVALS = ["AIK", "Malmö FF", "Hammarby", "Djurgården", "GAIS", "Örgryte"];

const Body = z.object({
  clubId: z.string(),
  opponent: z.string().min(2).max(60),
  goalsFor: z.number().int().min(0).max(30),
  goalsAgainst: z.number().int().min(0).max(30),
  home: z.boolean(),
  notifyTo: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, opponent, goalsFor, goalsAgainst, home, notifyTo } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const rival = RIVALS.some((r) => opponent.toLowerCase().includes(r.toLowerCase()));
  const result = goalsFor > goalsAgainst ? "seger" : goalsFor === goalsAgainst ? "oavgjort" : "förlust";
  const score = `${goalsFor}–${goalsAgainst}`;

  if (result === "förlust" || (result === "oavgjort" && !rival)) {
    return Response.json({
      action: "none",
      reason:
        result === "förlust"
          ? `Förlust ${score} mot ${opponent}. Inga motiv skapas efter förluster.`
          : `Oavgjort ${score} mot ${opponent}. Motiv skapas bara efter oavgjort i derbyn och stormatcher.`,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const signal: Signal = {
    id: `match-${today}-${opponent.toLowerCase().replace(/\W+/g, "-")}`,
    kind: "match",
    title: result === "seger" ? `Seger mot ${opponent}` : `Poäng i stormatchen mot ${opponent}`,
    detail: `${club.name} ${result === "seger" ? "vann" : "spelade"} ${score} mot ${opponent} ${home ? `hemma på ${club.arena}` : "på bortaplan"}${rival ? ". Derby/stormatch – extra laddat" : ""}.`,
    date: today,
  };

  try {
    const concepts = (hasOpenAIKey() ? await createConcepts(club, [signal]) : demoConcepts(club, [signal])).slice(0, 3);
    const suggestions = await Promise.all(
      concepts.map(async (c) => {
        const checks = checkConcept(club, c);
        if (!passesAll(checks)) return { ...c, checks, artwork: null };
        try {
          return { ...c, checks, artwork: await produceArtwork(club, c) };
        } catch (err) {
          return { ...c, checks, artwork: null, error: errorMessage(err) };
        }
      }),
    );

    const id = crypto.randomUUID();
    const origin = publicOrigin(req);
    const approveUrl = `${origin}/?drop=${id}`;
    const ready = suggestions.filter((s) => s.artwork?.passed).length;
    const text = `${club.nicknames[0]} ${result === "seger" ? "vann" : "tog en poäng"} ${score} mot ${opponent}! ${ready} motiv är klara för klubbshoppen. Välj och godkänn: ${approveUrl}`;
    const to = notifyTo || "Kansliet";
    const delivery = await sendSms(to, text);

    const drop = await saveDrop({
      id,
      clubId,
      createdAt: new Date().toISOString(),
      status: "pending",
      signal,
      suggestions,
      sms: { to, text, delivery, sentAt: new Date().toISOString() },
    });
    return Response.json({ action: "created", dropId: drop.id, approveUrl, sms: drop.sms, ready });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
