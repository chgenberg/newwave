import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BoothFormat } from "./demoCatalog";
import type { PricedLine } from "./demoOffer";

export type ShareEvent = { at: string; action: "approve" | "comment"; name: string; comment: string };
export type Share = {
  id: string;
  createdAt: string;
  brand: { name: string; site: string };
  boothUrl?: string;
  /** Missing on links shared before booths had a format. */
  format?: BoothFormat;
  lines: PricedLine[];
  totalSek: number;
  eventDate: string;
  visitors: string;
  reference: string;
  status: "pending" | "approved" | "commented";
  events: ShareEvent[];
};

export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
const DIR = path.join(process.cwd(), ".data", "demo", "shares");
export const MAX_EVENTS = 30;

/** 128 random bits: the link itself is the only credential, so it must not be guessable. */
export const newShareId = () => randomBytes(16).toString("base64url");

export async function countShares() {
  await mkdir(DIR, { recursive: true });
  return (await readdir(DIR)).length;
}

export async function readShare(id: string): Promise<Share | null> {
  if (!SHARE_ID.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(DIR, `${id}.json`), "utf8")) as Share;
  } catch {
    return null;
  }
}

export async function createShare(share: Share) {
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, `${share.id}.json`), JSON.stringify(share), { flag: "wx" });
}

/** Write-then-rename so a concurrent reader never sees half a file. */
export async function saveShare(share: Share) {
  const file = path.join(DIR, `${share.id}.json`);
  await writeFile(`${file}.tmp`, JSON.stringify(share));
  await rename(`${file}.tmp`, file);
}

/** Free text from a colleague: keeps punctuation and line breaks but no control characters or markup brackets. */
export const cleanComment = (raw: string, max: number) =>
  raw
    .normalize("NFKC")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F<>]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
