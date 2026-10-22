import { readData, writeData } from "@/lib/newwave/workspace";
import { allPrefs } from "./clubPrefs";
import type { Template } from "./schema";
import { allTemplates } from "./store";

/**
 * Vad klubbarna och Craft gör med mallarna: val i designstudion, klubbarnas favoriter och beställningar. De inbyggda
 * mallarna startar med fasta exempelsiffror i demon, så att sorteringen och förslagen syns innan riktiga val finns.
 */
const FILE = "newwave/wordmarks/stats.json";
type Counts = { picks: number; orders: number };
export type TemplateStat = Counts & { favorites: number; score: number; weak: boolean };
export type StatEvent = keyof Counts;

/** Fasta exempelsiffror per inbyggd mall; samma varje gång. */
function baseline(id: string): Counts {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const u = (h >>> 0) / 2 ** 32;
  return { picks: Math.round(6 + u * 54), orders: Math.round(u * u * 11) };
}

async function counted(): Promise<Record<string, Counts>> {
  try {
    const raw = JSON.parse((await readData(FILE)) ?? "{}") as Record<string, Partial<Counts>>;
    return Object.fromEntries(Object.entries(raw).map(([id, c]) => [id, { picks: Number(c.picks) || 0, orders: Number(c.orders) || 0 }]));
  } catch {
    return {};
  }
}

export async function track(template: string, event: StatEvent, n = 1) {
  if (!/^[a-z0-9-]{2,40}$/.test(template)) return;
  const all = await counted();
  const cur = all[template] ?? { picks: 0, orders: 0 };
  all[template] = { ...cur, [event]: cur[event] + n };
  await writeData(FILE, JSON.stringify(all, null, 2));
}

/** Val + 3 per favorit + 6 per beställning. De svagaste inbyggda mallarna föreslås för utfasning. */
export async function templateStats(): Promise<Record<string, TemplateStat>> {
  const [templates, own, prefs] = await Promise.all([allTemplates(), counted(), allPrefs()]);
  const favorites = new Map<string, number>();
  for (const p of Object.values(prefs)) for (const id of p.favorites) favorites.set(id, (favorites.get(id) ?? 0) + 1);
  const listed = templates.filter((t) => !t.hidden);
  const stats = listed.map((t) => {
    const base = t.source === "inbyggd" ? baseline(t.id) : { picks: 0, orders: 0 };
    const picks = base.picks + (own[t.id]?.picks ?? 0);
    const orders = base.orders + (own[t.id]?.orders ?? 0);
    const fav = favorites.get(t.id) ?? 0;
    return { id: t.id, inbyggd: t.source === "inbyggd", picks, orders, favorites: fav, score: picks + fav * 3 + orders * 6 };
  });
  const weak = new Set(
    stats
      .filter((s) => s.inbyggd)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((s) => s.id),
  );
  return Object.fromEntries(stats.map(({ id, picks, orders, favorites: f, score }) => [id, { picks, orders, favorites: f, score, weak: weak.has(id) }]));
}

export async function popularTemplates(n: number): Promise<Template[]> {
  const [stats, templates] = await Promise.all([templateStats(), allTemplates()]);
  return templates
    .filter((t) => stats[t.id])
    .sort((a, b) => stats[b.id].score - stats[a.id].score)
    .slice(0, n);
}
