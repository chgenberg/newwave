import { CLUBS } from "@/lib/club";
import { registryWordmarkClub } from "@/lib/newwave/clubRegistry";
import { craftClub } from "@/lib/newwave/craft";
import { readBrand } from "@/lib/newwave/store";
import { readData, writeData } from "@/lib/newwave/workspace";
import { sanitizeArt } from "./art";
import { type ClubPrefs, readPrefs } from "./clubPrefs";
import type { WordmarkClub } from "./render";
import { type Template, TemplateSchema } from "./schema";
import { TEMPLATES } from "./templates";

/** Mallar som Craft har importerat eller godkänt från mallagenten; de inbyggda ligger i templates.ts. */
const FILE = "newwave/wordmarks/templates.json";
const MAX_SAVED = 60;

async function saved(): Promise<Template[]> {
  try {
    const raw = JSON.parse((await readData(FILE)) ?? "[]") as unknown[];
    return raw.flatMap((t) => {
      const r = TemplateSchema.safeParse(t);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

export async function allTemplates(): Promise<Template[]> {
  return [...TEMPLATES, ...(await saved())];
}

export async function findTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? (await saved()).find((t) => t.id === id);
}

/** Validerar mallen, renar vektorgrafiken och sparar den med ett id som inte krockar. */
export async function saveTemplate(raw: unknown, source: "import" | "agent"): Promise<Template> {
  const parsed = TemplateSchema.parse(raw);
  for (const l of parsed.layers) if (l.kind === "art" && sanitizeArt(l.svg) === null) throw new Error("Grafiken i mallen innehåller något som inte är tillåtet");
  const list = await saved();
  const taken = new Set([...TEMPLATES, ...list].map((t) => t.id));
  let id = parsed.id;
  for (let n = 2; taken.has(id); n++) id = `${parsed.id.slice(0, 36)}-${n}`;
  const t: Template = { ...parsed, id, source };
  if (list.length >= MAX_SAVED) throw new Error(`Max ${MAX_SAVED} egna mallar – ta bort någon först`);
  await writeData(FILE, JSON.stringify([...list, t], null, 2));
  return t;
}

export async function removeTemplate(id: string) {
  const list = await saved();
  if (!list.some((t) => t.id === id)) return false;
  await writeData(FILE, JSON.stringify(list.filter((t) => t.id !== id), null, 2));
  return true;
}

/** Klubben som källan beskriver den, innan klubbens egna rättelser. */
export async function baseClub(id: string): Promise<WordmarkClub | null> {
  const c = craftClub(id);
  if (!c) return registryWordmarkClub(id);
  const own = CLUBS[id] ? (await readBrand(id)).palette?.map((p) => p.hex) : undefined;
  return { id: c.id, name: c.name, colors: own?.length ? own : c.colors, logo: c.logo, logoDark: c.logoDark, founded: CLUBS[id]?.founded, sports: c.sports };
}

/**
 * Klubbens namn, färger, märke och grundandeår, som ordmärket ritas med: Crafts klubbar först (med färgerna kansliet
 * satt under Varumärke), annars klubbregistret – och överst det klubben själv rättat i klubbportalen.
 */
export async function wordmarkClub(id: string, known?: ClubPrefs): Promise<WordmarkClub | null> {
  const [club, prefs] = await Promise.all([baseClub(id), known ?? readPrefs(id)]);
  if (!club) return null;
  return { ...club, ...(prefs.colors ? { colors: prefs.colors } : {}), ...(prefs.names ? { names: prefs.names } : {}) };
}
