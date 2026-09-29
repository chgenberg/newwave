import { CLUBS } from "@/lib/club";

export async function GET() {
  return Response.json({
    clubs: Object.values(CLUBS).map((c) => ({ id: c.id, name: c.name, city: c.city, nicknames: c.nicknames })),
  });
}
