import { randomUUID } from "node:crypto";
import { NW_CATALOG } from "./catalog";
import type { Customized } from "./marking";
import { readData, writeData } from "./workspace";

export type Campaign = {
  id: string;
  title: string;
  occasion: string;
  date?: string;
  brief: string;
  products: string[];
  clubIds: string[];
  createdAt: string;
  /** Dag då kampanjen når klubbarna; saknas när den skickades direkt. */
  sendAt?: string;
  deadline?: string;
  remind?: boolean;
  /** Materialet som kampanjen rullar ut från. */
  sourceId?: string;
  delivered?: boolean;
  reminded?: boolean;
  /** Godkännande-id per klubb med varumärkeskit i navet. */
  approvals?: Record<string, string>;
  /** Tryck och färg per produkt när kampanjen designats i studion; klubbens egen logga trycks. */
  designs?: Record<string, Omit<Customized, "mockupUrl">>;
};

export type ClubSettings = { autopilot: boolean; threshold: number };
export type Gate = "släppt" | "stoppad";
export type LogKind = "påminnelse" | "autopilot" | "uppstart" | "släppt" | "stoppad" | "kampanj" | "regler";
export type LogItem = { id: string; at: string; kind: LogKind; text: string; clubIds?: string[]; materialId?: string };
export type CraftRules = { rules: string[]; products: string[]; minScore: number };

type State = {
  campaigns: Campaign[];
  settings: Record<string, Partial<ClubSettings>>;
  gates: Record<string, Gate>;
  log: LogItem[];
  dismissed: string[];
  rules?: CraftRules;
  /** Produkter som anpassats i designstudion, per material och produkt. */
  designs?: Record<string, Record<string, Customized>>;
};

export const DEFAULT_RULES: CraftRules = {
  rules: [
    "Klubbens logga ska alltid vara med och får aldrig förvrängas eller färgas om.",
    "Aldrig andra klubbars sköldar, loggor, smeknamn eller färger.",
    "Text på plagg ska vara minst 8 mm hög så att den går att trycka.",
    "Craft-loggan sitter diskret på ärm eller nacke, aldrig på bröstet.",
    "Inga referenser till alkohol, spel eller tobak.",
  ],
  products: NW_CATALOG.filter((p) => p.kind !== "booth").map((p) => p.id),
  minScore: 7,
};

const FILE = "newwave/craft/state.json";
const EMPTY: State = { campaigns: [], settings: {}, gates: {}, log: [], dismissed: [] };

export async function readState(): Promise<State> {
  try {
    return { ...EMPTY, ...(JSON.parse((await readData(FILE)) ?? "{}") as Partial<State>) };
  } catch {
    return { ...EMPTY };
  }
}

export async function updateState(fn: (s: State) => void | Promise<void>) {
  const state = await readState();
  await fn(state);
  await writeData(FILE, JSON.stringify(state, null, 2));
  return state;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function logItem(input: Omit<LogItem, "id" | "at">): LogItem {
  return { ...input, id: randomUUID().slice(0, 8), at: new Date().toISOString() };
}

export const newId = () => randomUUID().slice(0, 8);

export async function readCraftRules(): Promise<CraftRules> {
  return (await readState()).rules ?? DEFAULT_RULES;
}
