import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanText } from "@/lib/demoLimit";
import { generateJson } from "@/lib/openai";
import { nwProduct } from "./catalog";
import { type OccasionId, occasion } from "./occasions";

export type Idea = { id: string; reason: string };
export type IdeasRequest = { occasion: OccasionId; name: string; industry: string; offering: string; tone: string };

const VERSION = "i1";
const CACHE = path.join(process.cwd(), ".data", "newwave", "ideas");
const running = new Map<string, Promise<Idea[]>>();

const keyOf = (r: IdeasRequest, candidates: string[]) => createHash("sha1").update([VERSION, r.occasion, r.name, r.industry, r.offering, candidates.join(",")].join("|")).digest("hex").slice(0, 20);

async function readCache(key: string) {
  try {
    return (JSON.parse(await readFile(path.join(CACHE, `${key}.json`), "utf8")) as { ideas: Idea[] }).ideas;
  } catch {
    return null;
  }
}

/** Fyra produkter ur butikens utbud som passar just det här företaget på tillfället, med en mening om varför. */
export async function eventIdeas(req: IdeasRequest, candidates: string[], opts: { allow: () => boolean }): Promise<Idea[] | null> {
  const key = keyOf(req, candidates);
  const hit = await readCache(key);
  if (hit) return hit;
  const busy = running.get(key);
  if (busy) return busy;
  if (!opts.allow()) return null;

  const o = occasion(req.occasion)!;
  const products = candidates.flatMap((id) => {
    const p = nwProduct(id);
    return p ? [`${p.id}: ${p.name} (${p.category}, passar till ${p.use})`] : [];
  });
  const job = (async () => {
    const out = await generateJson<{ ideas: Idea[] }>({
      system: `Du är produktagenten i en webbshop för profilprodukter. Ett företag planerar ${o.name.toLowerCase()} (${o.hint.toLowerCase()}). Välj exakt fyra produkter ur listan som passar just det här företaget och tillfället bäst.
- Utgå från vad företaget gör och vilka de möter. Välj olika sorters produkter, inte fyra kläder.
- reason: en mening på svenska, högst 16 ord, som nämner företagets verksamhet eller kunder och varför produkten passar. Hitta inte på fakta.`,
      user: `Företag: ${cleanText(req.name, 40)}
Bransch: ${cleanText(req.industry, 60) || "okänd"}
Erbjudande: ${cleanText(req.offering, 160) || "okänt"}
Ton: ${cleanText(req.tone, 80) || "okänd"}

Produkter:
${products.join("\n")}`,
      schemaName: "event_ideas",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ideas"],
        properties: {
          ideas: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["id", "reason"], properties: { id: { type: "string", enum: candidates }, reason: { type: "string" } } },
          },
        },
      },
    });
    const ideas: Idea[] = [];
    for (const i of out.ideas ?? []) if (candidates.includes(i.id) && !ideas.some((x) => x.id === i.id) && ideas.length < 4) ideas.push({ id: i.id, reason: i.reason.trim().slice(0, 160) });
    await mkdir(CACHE, { recursive: true });
    await writeFile(path.join(CACHE, `${key}.json`), JSON.stringify({ ideas, at: new Date().toISOString() }));
    return ideas;
  })();
  running.set(key, job);
  try {
    return await job;
  } finally {
    running.delete(key);
  }
}
