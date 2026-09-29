import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ArtworkResult } from "./artwork";
import type { Concept, RuleCheck, Signal } from "./types";

const DIR = path.join(process.cwd(), ".data", "drops");

export type PendingDrop = {
  id: string;
  clubId: string;
  createdAt: string;
  status: "pending" | "approved";
  signal: Signal;
  suggestions: (Concept & { checks: RuleCheck[]; artwork: ArtworkResult | null; error?: string })[];
  sms: { to: string; text: string; delivery: "twilio" | "simulerad"; sentAt: string };
};

export async function saveDrop(drop: Omit<PendingDrop, "id"> & { id?: string }) {
  await mkdir(DIR, { recursive: true });
  const full = { ...drop, id: drop.id ?? randomUUID() } as PendingDrop;
  await writeFile(path.join(DIR, `${full.id}.json`), JSON.stringify(full, null, 2));
  return full;
}

export async function loadDrop(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as PendingDrop;
  } catch {
    return null;
  }
}
