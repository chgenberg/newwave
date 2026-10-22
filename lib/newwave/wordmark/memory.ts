import { createHash } from "node:crypto";
import { readData, updateJson, writeData } from "@/lib/newwave/workspace";
import { FONT_ROLE_LABEL } from "./fonts";
import { type Candidate, READ_ROLE_LABEL, type Reading } from "./importSvg";

/**
 * Läsagentens minne. Varje fil som lästs sparas med agentens svar och Crafts rättelser, så att samma fil öppnas igen
 * utan AI och med rättelserna. Rättelserna blir också exempel som agenten får med sig när den läser nästa fil.
 * Allt delas av alla i Craft.
 */

/** `mark` är ett känt varumärke som agenten kände igen i designen, t.ex. "Miami Dolphins (NFL)". */
export type Answer = Reading & { club: string; notes: string[]; mark?: string };
export type Remembered = { key: string; at: string; name: string; model: string; candidates: Candidate[]; agent: Answer; corrected?: Answer; correctedAt?: string };
/** `key` är filen rättelsen kom från – rättas filen igen ersätter de nya rättelserna de gamla. */
type Lesson = { at: string; key: string; text: string };
/** Läsningen som importen får: från agenten nu, ur minnet eller med Crafts rättelser – och vilken modell som läste. */
export type ReadResult = Answer & { key: string; memory: "new" | "read" | "corrected"; at: string; model: string; lessons: number };

const DIR = "newwave/wordmarks/reads";
const LESSONS = "newwave/wordmarks/lessons.json";
const MAX_LESSONS = 40;
/** Så många rättelser följer med till agenten, de senaste först. */
const IN_PROMPT = 12;
const KEY = /^[0-9a-f]{32}$/;

/** Samma fil ger samma delar och samma bild – och därmed samma nyckel. */
export const readKey = (candidates: Candidate[], image: string) => createHash("sha256").update(JSON.stringify(candidates)).update(image).digest("hex").slice(0, 32);

export async function recall(key: string): Promise<Remembered | null> {
  if (!KEY.test(key)) return null;
  try {
    return JSON.parse((await readData(`${DIR}/${key}.json`, { shared: true })) ?? "null") as Remembered | null;
  } catch {
    return null;
  }
}

export async function remember(entry: Remembered) {
  await writeData(`${DIR}/${entry.key}.json`, JSON.stringify(entry), { shared: true });
}

const part = (c: Candidate) => (c.text ? `texten ”${c.text.slice(0, 40)}”` : c.kind === "group" ? `en grupp med ${c.shapes} former` : c.kind === "image" ? "en inbäddad bild" : "en form");
const where = (c: Candidate) => `ruta ${c.box.map((n) => Math.round(n)).join(",")}`;

/** Det Craft ändrade i agentens tolkning, som korta meningar agenten kan lära sig av. */
export function lessonsFrom(agent: Answer, fixed: Reading, candidates: Candidate[]) {
  const out: string[] = [];
  for (const c of candidates) {
    const [was, is] = [agent.roles[c.i], fixed.roles[c.i]];
    if (was && is && was !== is) out.push(`${part(c)} (${where(c)}) var ${READ_ROLE_LABEL[is].toLowerCase()} (${is}), inte ${READ_ROLE_LABEL[was].toLowerCase()} (${was}).`);
    const [s0, s1] = [agent.styles?.[c.i], fixed.styles?.[c.i]];
    if (is === was && s0 && s1 && s0.font !== s1.font) out.push(`${part(c)} ritad som former var ${FONT_ROLE_LABEL[s1.font].toLowerCase()} (${s1.font}), inte ${s0.font}.`);
  }
  for (const [hex, slot] of Object.entries(fixed.colors)) {
    const was = agent.colors[hex];
    if (was && was !== slot) out.push(`Färgen ${hex} var ${slot}, inte ${was}.`);
  }
  return out.slice(0, 8);
}

export async function correct(key: string, fixed: Answer) {
  const saved = await recall(key);
  if (!saved) return null;
  const at = new Date().toISOString();
  await remember({ ...saved, corrected: fixed, correctedAt: at });
  const learned = lessonsFrom(saved.agent, fixed, saved.candidates).map((text) => ({ at, key, text: `${saved.name.slice(0, 60)}: ${text}` }));
  await updateJson<Lesson[]>(LESSONS, [], (cur) => [...learned, ...cur.filter((l) => l.key !== key)].slice(0, MAX_LESSONS), { shared: true });
  return learned.length;
}

/** De senaste rättelserna som text till agenten; tom när Craft inte rättat något än. */
export async function lessons() {
  try {
    const list = JSON.parse((await readData(LESSONS, { shared: true })) ?? "[]") as Lesson[];
    return list.slice(0, IN_PROMPT).map((l) => l.text);
  } catch {
    return [];
  }
}
