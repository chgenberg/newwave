import { z } from "zod";
import { queryClubs } from "@/lib/newwave/clubRegistry";
import { type ClubCheck, renderWordmark } from "@/lib/newwave/wordmark/render";
import { findTemplate, wordmarkClub } from "@/lib/newwave/wordmark/store";

const Body = z.object({
  template: z.string().min(1).max(60),
  clubs: z.array(z.string().max(40)).max(60).optional(),
  /** Så många av de största klubbarna med märke, för att se hur designen klarar sig innan den går till alla. */
  sample: z.number().int().min(1).max(200).optional(),
  variant: z.enum(["light", "dark"]).default("light"),
});
const AT_ONCE = 8;

/**
 * Ritar designen för klubbarna och returnerar det kontrollen såg: namn som kortats eller blir för små, färger som inte
 * syns och märken som saknas. Ingen AI – samma mått som när märket ritas för tryck.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.clubs?.length && !parsed.data.sample)) return Response.json({ error: "Ange designen och klubbarna." }, { status: 400 });
  const { variant, sample } = parsed.data;
  const template = await findTemplate(parsed.data.template);
  if (!template) return Response.json({ error: "Designen finns inte." }, { status: 404 });
  const ids = parsed.data.clubs?.length
    ? parsed.data.clubs
    : ((await queryClubs({ q: "", county: "", sport: "", sort: "size", offset: 0, limit: sample! }))?.items.map((c) => c.id) ?? []);
  const queue = [...ids];
  const out: ClubCheck[] = [];
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const club = await wordmarkClub(id);
        if (!club) continue;
        const r = await renderWordmark(template, club, { icon: true, ornament: true, variant });
        out.push({ id, name: club.name, notes: r.notes });
      }
    }),
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return Response.json({ checked: out.sort((a, b) => order.get(a.id)! - order.get(b.id)!) });
}
