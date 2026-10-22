import { SORTS, queryClubs } from "@/lib/newwave/clubRegistry";

const pick = <T extends string>(list: readonly T[], v: string | null, fallback: T) => (list.includes(v as T) ? (v as T) : fallback);

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const result = await queryClubs({
    q: (p.get("q") ?? "").slice(0, 80),
    county: (p.get("county") ?? "").slice(0, 40),
    sport: (p.get("sport") ?? "").slice(0, 60),
    sort: pick(SORTS, p.get("sort"), "size"),
    offset: Math.max(0, Number(p.get("offset")) || 0),
    limit: Math.min(120, Math.max(1, Number(p.get("limit")) || 60)),
  });
  if (!result) return Response.json({ error: "Klubbregistret är inte uppbyggt än." }, { status: 404 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
