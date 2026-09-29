import { upcomingOccasions, seasonFor } from "@/lib/calendar";
import { CLUBS } from "@/lib/club";
import { errorMessage } from "@/lib/openai";
import { clubTrends } from "@/lib/trends";

export const maxDuration = 60;

export async function GET(req: Request) {
  const clubId = new URL(req.url).searchParams.get("clubId") ?? "";
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const now = new Date();
  let trends: Awaited<ReturnType<typeof clubTrends>> = [];
  let trendError: string | null = null;
  try {
    trends = await clubTrends(club);
  } catch (err) {
    trendError = errorMessage(err);
  }

  return Response.json({
    today: now.toISOString().slice(0, 10),
    season: seasonFor(now),
    occasions: upcomingOccasions(now),
    trends,
    trendError,
  });
}
