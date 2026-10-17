import { z } from "zod";
import { NW_CATALOG } from "@/lib/newwave/catalog";
import { craftOverview } from "@/lib/newwave/craft";
import { SEASON_OF, TEMPLATES, craftCalendar, seasonProducts } from "@/lib/newwave/craftCalendar";
import { parseClubQuery } from "@/lib/newwave/craftQuery";
import { readCraftRules } from "@/lib/newwave/craftState";
import { errorMessage, generateJson, hasOpenAIKey } from "@/lib/openai";

export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(4).max(400) });

type Draft = { title: string; occasion: string; date: string; brief: string; products: string[]; clubIds: string[]; reasoning: string };

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Beskriv kampanjen med några ord" }, { status: 400 });
  const { text } = parsed.data;
  const now = new Date();
  const [rows, rules] = await Promise.all([craftOverview(now.getTime()), readCraftRules()]);
  const allowed = NW_CATALOG.filter((p) => rules.products.includes(p.id));
  const calendar = craftCalendar(now, 365);

  if (hasOpenAIKey()) {
    try {
      const draft = await generateJson<Draft>({
        schemaName: "craft_campaign",
        system: `Du är Craft-agenten. Craft gör klubbmerch åt idrottsföreningar och skickar kampanjer som varje klubbs egen agent anpassar till klubbens färger och ton.
Gör om Crafts beskrivning till en färdig kampanj. Regler:
- Välj 2–4 produkter som passar säsongen och aktiviteten (vinter: mössor, hoodies, termos; sommar: keps, kylväska, picknickfilt). Bara från listan.
- Välj klubbar som matchar beskrivningen (sport, region, ort, status). Säger beskrivningen inget om vilka, välj de aktiva klubbarna där kampanjen passar sporten.
- date är kampanjens dag (YYYY-MM-DD) – ta nästa förekomst av tillfället ur kalendern om det finns, annars en rimlig dag. Tom sträng om ingen dag passar.
- title: kort och slagkraftig, högst 6 ord. brief: 2–3 meningar till klubbarnas agenter. reasoning: en mening om varför du valde produkterna och klubbarna.
Crafts regler som allt material måste följa:
${rules.rules.map((r) => `- ${r}`).join("\n")}`,
        user: `I dag: ${now.toISOString().slice(0, 10)}
Beskrivning: ${text}

Kalender: ${calendar.map((c) => `${c.occasion} ${c.date}`).join(", ")}

Produkter:
${allowed.map((p) => `${p.id}: ${p.name} (${p.seasons.join("/")}) – ${p.use}`).join("\n")}

Klubbar:
${rows.map((r) => `${r.id}: ${r.name}, ${r.city}, ${r.region}, ${r.sports.join("/")}, ${r.status}, ${r.stats.sold} sålda`).join("\n")}`,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["title", "occasion", "date", "brief", "products", "clubIds", "reasoning"],
          properties: {
            title: { type: "string" },
            occasion: { type: "string" },
            date: { type: "string" },
            brief: { type: "string" },
            products: { type: "array", items: { type: "string", enum: allowed.map((p) => p.id) } },
            clubIds: { type: "array", items: { type: "string", enum: rows.map((r) => r.id) } },
            reasoning: { type: "string" },
          },
        },
      });
      return Response.json({ mode: "ai", draft: { ...draft, date: /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : "" } });
    } catch (err) {
      console.error("craft brief", errorMessage(err));
    }
  }

  const q = parseClubQuery(text, {
    regions: [...new Set(rows.map((r) => r.region))],
    sports: [...new Set(rows.flatMap((r) => r.sports))],
    cities: [...new Set(rows.map((r) => r.city))],
    clubs: rows,
  });
  const lower = text.toLowerCase();
  const occ = calendar.find((c) => lower.includes(c.occasion.toLowerCase())) ?? null;
  const tpl = TEMPLATES.find((t) => lower.includes(t.occasion.toLowerCase()));
  const month = occ ? Number(occ.date.slice(5, 7)) : /vinter|jul|mössa/.test(lower) ? 12 : /sommar|cup/.test(lower) ? 6 : now.getMonth() + 1;
  const clubs = rows.filter(
    (r) =>
      (!q.sports.length || q.sports.some((s) => r.sports.includes(s))) &&
      (!q.regions.length || q.regions.includes(r.region)) &&
      (!q.cities.length || q.cities.includes(r.city)) &&
      (!q.statuses.length ? r.status !== "inaktiv" || q.regions.length + q.sports.length > 0 : q.statuses.includes(r.status)),
  );
  const draft: Draft = {
    title: tpl?.title ?? text.replace(/^./, (c) => c.toUpperCase()).slice(0, 60),
    occasion: tpl?.occasion ?? occ?.occasion ?? "Kampanj",
    date: occ?.date ?? "",
    brief: tpl?.brief ?? `${text.replace(/^./, (c) => c.toUpperCase())}. Anpassa motivet till varje klubbs färger och ton.`,
    products: (tpl?.products ?? seasonProducts(SEASON_OF(month), rules.products, 3)).filter((id) => rules.products.includes(id)),
    clubIds: clubs.map((r) => r.id),
    reasoning: `Valde ${clubs.length} klubbar${q.labels.length ? ` (${q.labels.join(", ").toLowerCase()})` : ""} och produkter som passar ${SEASON_OF(month)}en.`,
  };
  return Response.json({ mode: "demo", draft });
}
