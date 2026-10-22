import { z } from "zod";
import { readData, writeData } from "@/lib/newwave/workspace";

/**
 * Det klubben själv har sagt om sina ordmärken: rättade färger och namn, favoriter och godkännandet att Craft får
 * trycka. Rättelserna gäller överallt där klubbens ordmärken ritas; ändras de släpper godkännandet. Valen delas av
 * alla, inte per demomiljö, så att det klubben svarar via sin länk syns i Craft.
 */
const FILE = "newwave/wordmarks/clubs.json";
const ID = /^[a-z0-9-]{1,80}$/;
const TEMPLATE = /^[a-z0-9-]{2,40}$/;
const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Name = z.string().trim().max(30).regex(/^[^<>\u0000-\u001f]*$/);

export const PrefsSchema = z.object({
  colors: z.array(Hex).min(1).max(4).optional(),
  names: z.object({ name1: Name.optional(), name2: Name.optional() }).optional(),
  favorites: z.array(z.string().regex(TEMPLATE)).max(12).default([]),
  approved: z.object({ at: z.string(), by: z.string().max(60) }).optional(),
  updatedAt: z.string().optional(),
});
export type ClubPrefs = z.infer<typeof PrefsSchema>;

export const PrefsPatch = z.object({
  colors: z.array(Hex).min(1).max(4).nullable().optional(),
  names: z.object({ name1: Name.optional(), name2: Name.optional() }).nullable().optional(),
  favorites: z.array(z.string().regex(TEMPLATE)).max(12).optional(),
  approve: z.object({ by: z.string().trim().min(2).max(60) }).nullable().optional(),
});
export type PrefsPatchT = z.infer<typeof PrefsPatch>;

async function readAll(): Promise<Record<string, ClubPrefs>> {
  try {
    const raw = JSON.parse((await readData(FILE, { shared: true })) ?? "{}") as Record<string, unknown>;
    const out: Record<string, ClubPrefs> = {};
    for (const [id, v] of Object.entries(raw)) {
      const r = PrefsSchema.safeParse(v);
      if (ID.test(id) && r.success) out[id] = r.data;
    }
    return out;
  } catch {
    return {};
  }
}

export const allPrefs = readAll;
export const readPrefs = async (id: string): Promise<ClubPrefs> => (await readAll())[id] ?? { favorites: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function writePrefs(id: string, patch: PrefsPatchT): Promise<ClubPrefs> {
  if (!ID.test(id)) throw new Error("Okänd klubb");
  const all = await readAll();
  const cur = all[id] ?? { favorites: [] };
  const next: ClubPrefs = { ...cur, favorites: patch.favorites ?? cur.favorites, updatedAt: new Date().toISOString() };
  if (patch.colors !== undefined) next.colors = patch.colors ?? undefined;
  if (patch.names !== undefined) {
    const n = { name1: patch.names?.name1 || undefined, name2: patch.names?.name2 || undefined };
    next.names = n.name1 || n.name2 ? n : undefined;
  }
  const changed = !same(cur.colors, next.colors) || !same(cur.names, next.names);
  if (patch.approve) next.approved = { at: new Date().toISOString(), by: patch.approve.by };
  else if (patch.approve === null || changed) next.approved = undefined;
  all[id] = next;
  await writeData(FILE, JSON.stringify(all, null, 2), { shared: true });
  return next;
}
