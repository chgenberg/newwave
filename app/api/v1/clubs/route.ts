import { CLUBS } from "@/lib/club";

/** Klubbväljarnas lista; `?hub=1` tar med klubbarna som bara finns i Next Wave-hubben. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") === "brand" ? "brand" : undefined;
  const hub = q.has("hub");
  return Response.json({
    clubs: Object.values(CLUBS).filter((c) => c.kind === kind && (hub || !c.unlisted)).map((c) => ({ id: c.id, name: c.name, city: c.city, nicknames: c.nicknames })),
  });
}
