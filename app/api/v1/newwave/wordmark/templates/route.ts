import { z } from "zod";
import { lacksText, textsFor } from "@/lib/newwave/wordmark/render";
import { fitScore } from "@/lib/newwave/wordmark/schema";
import { templateStats } from "@/lib/newwave/wordmark/stats";
import { allTemplates, findTemplate, removeTemplate, saveTemplate, wordmarkClub } from "@/lib/newwave/wordmark/store";

/**
 * Wordmarken som går att välja. Med en klubb kommer de som passar namnlängden bäst först och mallar som kräver text
 * klubben saknar (jubileum utan grundandeår) tas bort; `sort=popular` sorterar efter klubbarnas val. Ryggtrycken
 * hamnar sist eftersom de inte är ett wordmark för bröstet.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (id) {
    const template = await findTemplate(id);
    return template ? Response.json({ template }) : Response.json({ error: "Mallen finns inte." }, { status: 404 });
  }
  const [club, stats] = await Promise.all([wordmarkClub(params.get("c") ?? ""), templateStats()]);
  const texts = club ? textsFor(club, {}) : null;
  const names = texts ? { name1: texts.name1, name2: texts.name2 } : null;
  const chars = names ? [...names.name2].length : 8;
  const templates = (await allTemplates())
    .filter((t) => !t.hidden && !(texts && lacksText(t, texts)))
    .map((t) => ({ id: t.id, name: t.name, style: t.style, source: t.source, score: fitScore(t, chars), stats: stats[t.id] }));
  const popular = (a: (typeof templates)[number], b: (typeof templates)[number]) => (b.stats?.score ?? 0) - (a.stats?.score ?? 0);
  const back = (t: (typeof templates)[number]) => (t.style === "Rygg" ? 1 : 0);
  if (params.get("sort") === "popular") templates.sort((a, b) => back(a) - back(b) || popular(a, b));
  else if (club) templates.sort((a, b) => back(a) - back(b) || b.score - a.score || popular(a, b));
  return Response.json({ templates, names });
}

const Body = z.object({ template: z.unknown(), source: z.enum(["import", "agent"]) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mallen saknas." }, { status: 400 });
  try {
    return Response.json({ template: await saveTemplate(parsed.data.template, parsed.data.source) });
  } catch (e) {
    return Response.json({ error: e instanceof z.ZodError ? "Mallen följer inte formatet." : e instanceof Error ? e.message : "Kunde inte spara mallen." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await removeTemplate(id)) ? new Response(null, { status: 204 }) : Response.json({ error: "Bara egna mallar kan tas bort." }, { status: 404 });
}
