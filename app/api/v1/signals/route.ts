import { upcomingOccasions, seasonFor } from "@/lib/calendar";
import { CLUBS } from "@/lib/club";
import { errorMessage } from "@/lib/openai";
import { matchSignals, weatherSignal } from "@/lib/sources";
import { clubTrends } from "@/lib/trends";
import type { Signal, SourceStatus } from "@/lib/types";

export const maxDuration = 60;

export async function GET(req: Request) {
  const clubId = new URL(req.url).searchParams.get("clubId") ?? "";
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const now = new Date();
  const [trendRes, matchRes, weatherRes] = await Promise.allSettled([clubTrends(club), matchSignals(club, now), weatherSignal(club)]);

  const trends = trendRes.status === "fulfilled" ? trendRes.value.trends : [];
  const matches: Signal[] = matchRes.status === "fulfilled" ? matchRes.value : [];
  const weather = weatherRes.status === "fulfilled" ? weatherRes.value : null;
  const sources: SourceStatus[] = [
    ...(trendRes.status === "fulfilled" ? trendRes.value.status : []),
    matchRes.status === "fulfilled"
      ? { id: "match", name: "Allsvenskan", ok: true, count: matches.length }
      : { id: "match", name: "Allsvenskan", ok: false, count: 0, note: errorMessage(matchRes.reason) },
    weather
      ? { id: "weather", name: "SMHI", ok: true, count: 1 }
      : { id: "weather", name: "SMHI", ok: false, count: 0, note: weatherRes.status === "rejected" ? errorMessage(weatherRes.reason) : undefined },
  ];

  return Response.json({
    today: now.toISOString().slice(0, 10),
    season: seasonFor(now),
    occasions: upcomingOccasions(now),
    trends,
    matches,
    weather,
    sources,
    trendError: trendRes.status === "rejected" ? errorMessage(trendRes.reason) : null,
  });
}
