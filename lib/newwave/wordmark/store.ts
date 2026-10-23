import { CLUBS } from "@/lib/club";
import { registryWordmarkClub } from "@/lib/newwave/clubRegistry";
import { craftClub } from "@/lib/newwave/craft";
import { readBrand } from "@/lib/newwave/store";
import { readData, updateJson, writeData } from "@/lib/newwave/workspace";
import { sanitizeArt } from "./art";
import { type ClubPrefs, readPrefs } from "./clubPrefs";
import type { WordmarkClub } from "./render";
import { type Template, TemplateSchema } from "./schema";
import { TEMPLATES } from "./templates";

/** Mallar som Craft har importerat eller godkänt från mallagenten; de inbyggda ligger i templates.ts. */
const FILE = "newwave/wordmarks/templates.json";
/** Mallar som publicerats i någon klubbs shop. Klubbarnas val delas av alla, så mallarna de pekar på måste också göra det. */
const PUBLISHED = "newwave/wordmarks/published.json";
/** Designer som Craft tilldelat alla klubbar: de kommer först i varje shop, efter klubbens egna favoriter. */
const FEATURED = "newwave/wordmarks/featured.json";
const MAX_SAVED = 60;
const MAX_PUBLISHED = 500;
const MAX_FEATURED = 24;

const parseList = (raw: unknown): Template[] =>
  (Array.isArray(raw) ? raw : []).flatMap((t) => {
    const r = TemplateSchema.safeParse(t);
    return r.success ? [r.data] : [];
  });

async function readList(rel: string, shared: boolean): Promise<Template[]> {
  try {
    return parseList(JSON.parse((await readData(rel, { shared })) ?? "[]"));
  } catch {
    return [];
  }
}

const saved = () => readList(FILE, false);
const published = () => readList(PUBLISHED, true);

export async function allTemplates(): Promise<Template[]> {
  const own = await saved();
  const ids = new Set(own.map((t) => t.id));
  return [...TEMPLATES, ...own, ...(await published()).filter((t) => !ids.has(t.id))];
}

export async function findTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? (await saved()).find((t) => t.id === id) ?? (await published()).find((t) => t.id === id);
}

export class TemplateTaken extends Error {}

/** Gör besökarens egna mallar bland `ids` synliga för alla, inför att de blir favoriter i en klubbs shop. */
export async function publishTemplates(ids: string[]) {
  const own = (await saved()).filter((t) => ids.includes(t.id));
  if (!own.length) return;
  await updateJson<unknown[]>(
    PUBLISHED,
    [],
    (cur) => {
      const list = parseList(cur);
      for (const t of own) {
        const there = list.find((x) => x.id === t.id);
        if (there && JSON.stringify(there) !== JSON.stringify(t)) throw new TemplateTaken("En annan design med samma namn är redan publicerad. Spara designen igen med ett annat namn.");
        if (!there) list.push(t);
      }
      if (list.length > MAX_PUBLISHED) throw new Error("För många publicerade mallar");
      return list;
    },
    { shared: true },
  );
}

const idList = (raw: unknown) => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []).slice(0, MAX_FEATURED);

export async function featuredTemplates(): Promise<string[]> {
  try {
    return idList(JSON.parse((await readData(FEATURED, { shared: true })) ?? "[]"));
  } catch {
    return [];
  }
}

/** Tilldelar designen alla klubbar (senast tilldelad först) eller tar bort den därifrån. */
export async function featureTemplate(id: string, on: boolean): Promise<string[]> {
  if (on) await publishTemplates([id]);
  return updateJson<unknown>(
    FEATURED,
    [],
    (cur) => {
      const ids = idList(cur).filter((x) => x !== id);
      return on ? [id, ...ids].slice(0, MAX_FEATURED) : ids;
    },
    { shared: true },
  ).then(idList);
}

/** Validerar mallen, renar vektorgrafiken och sparar den med ett id som inte krockar. */
export async function saveTemplate(raw: unknown, source: "import" | "agent"): Promise<Template> {
  const parsed = TemplateSchema.parse(raw);
  for (const l of parsed.layers) if (l.kind === "art" && sanitizeArt(l.svg) === null) throw new Error("Grafiken i mallen innehåller något som inte är tillåtet");
  const list = await saved();
  const taken = new Set([...TEMPLATES, ...list, ...(await published())].map((t) => t.id));
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
  if (!c) {
    const [registry, grasrot] = await Promise.all([registryWordmarkClub(id), import("@/lib/newwave/grasrot/shop")]);
    // Gräsrot 360-föreningarna heter som i Bilaga 1 ("Hisingsbacka FC", inte registrets "Hisingsbacka Fc").
    const name = grasrot.grasrotClubName(id);
    return registry ? { ...registry, ...(name && { name }) } : grasrot.grasrotWordmarkClub(id);
  }
  const own = CLUBS[id] ? (await readBrand(id)).palette?.map((p) => p.hex) : undefined;
  return { id: c.id, name: c.name, colors: own?.length ? own : c.colors, logo: c.logo, logoDark: c.logoDark, founded: CLUBS[id]?.founded, sports: c.sports };
}

/**
 * Klubbens namn, färger, märke och grundandeår, som wordmarket ritas med: Crafts klubbar först (med färgerna kansliet
 * satt under Varumärke), annars klubbregistret, annars Gräsrot 360-föreningarna – och överst det klubben själv rättat i
 * klubbportalen.
 */
export async function wordmarkClub(id: string, known?: ClubPrefs): Promise<WordmarkClub | null> {
  const [club, prefs] = await Promise.all([baseClub(id), known ?? readPrefs(id)]);
  if (!club) return null;
  return { ...club, ...(prefs.colors ? { colors: prefs.colors } : {}), ...(prefs.names ? { names: prefs.names } : {}) };
}
