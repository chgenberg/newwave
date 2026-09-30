import { CLUBS } from "@/lib/club";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") === "brand" ? "brand" : undefined;
  return Response.json({
    clubs: Object.values(CLUBS).filter((c) => c.kind === kind).map((c) => ({ id: c.id, name: c.name, city: c.city, nicknames: c.nicknames })),
  });
}
