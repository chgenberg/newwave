import { randomUUID } from "node:crypto";
import { addProducts } from "@/lib/intersport";
import type { ProductSchema } from "@/lib/intersport";
import type { Club, Concept, ContentPack } from "@/lib/types";
import type { Customized } from "./marking";
import type { z } from "zod";
import { APPROVALS, FEED, type FeedItem } from "./club";
import { readCraftRules } from "./craftState";
import { readData, writeData } from "./workspace";

const TZ = "Europe/Stockholm";

export type ApprovalStatus = "väntar" | "godkänd" | "ändring";

export type ApprovalProduct = { id: string; name: string; priceSek: number; mockupUrl: string; printUrl?: string; custom?: Omit<Customized, "mockupUrl"> };

export type PackContent = Pick<ContentPack, "instagram" | "facebook" | "newsletter"> & Partial<Pick<ContentPack, "banner" | "tiktok" | "plan">>;

/** Färdiga bilder till kanalerna, i samma motiv och med samma tryck. */
export type PackAssets = { feed: string; story: string; banner: string; poster: string };

export type PackPhoto = { id: string; label: string; url: string };

/** Motiven som veckokörningen valde mellan; betygen är varumärkes- och säljgranskarens. */
export type WeeklyCandidate = { concept: Concept; brand: number; sales: number; note: string };

export type WeeklyRun = { week: number; signals: string[]; candidates: WeeklyCandidate[]; picked: number };

export type Approval = {
  id: string;
  kind: string;
  title: string;
  occasion: string;
  createdAt: string;
  status: ApprovalStatus;
  slogan?: string;
  story?: string;
  previewUrl?: string;
  content?: PackContent;
  assets?: PackAssets;
  photos?: PackPhoto[];
  printFiles?: { light: string; dark: string };
  shopUrl?: string;
  /** Satt när materialet kommer från veckans automatiska körning. */
  weekly?: WeeklyRun;
  products?: ApprovalProduct[];
  shopProducts?: z.infer<typeof ProductSchema>[];
  note?: string;
  decidedAt?: string;
  /** Vem som skickade materialet, t.ex. "Craft". Saknas när klubbens egen agent skapat det. */
  from?: string;
};

export const RULE_SCOPES = ["allt", "motiv", "texter", "bilder"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

/** En regel kansliet själv lagt till; `text` är agentens tydliga formulering, `original` det kansliet skrev. */
export type OwnRule = { id: string; text: string; scope: RuleScope; original: string; addedAt: string };

export type BrandState = {
  tone?: string;
  tagline?: string;
  keywords?: string[];
  rules?: string[];
  summary?: string;
  scannedAt?: string;
  toneApproved?: boolean;
  /** Klubbens egna färger när kansliet har ändrat dem; första är huvudfärg, andra accent. */
  palette?: { name: string; hex: string }[];
  ownRules?: OwnRule[];
};

const file = (clubId: string, name: string) => `newwave/${clubId.replace(/[^a-z0-9-]/g, "")}/${name}.json`;

async function read<T>(clubId: string, name: string, fallback: () => T): Promise<T> {
  try {
    const raw = await readData(file(clubId, name));
    return raw === null ? fallback() : (JSON.parse(raw) as T);
  } catch {
    return fallback();
  }
}

const write = (clubId: string, name: string, data: unknown) => writeData(file(clubId, name), JSON.stringify(data, null, 2));

export const stamp = (d = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(d);

/** Bara demoklubben har startdata; övriga klubbar börjar tomma. */
const SEEDED = "asa-if";

const seedApprovals = (clubId: string): Approval[] => (clubId === SEEDED ? APPROVALS.map((a) => ({ ...a, status: "väntar" })) : []);

export const listApprovals = (clubId: string) => read<Approval[]>(clubId, "approvals", () => seedApprovals(clubId));

export async function getApproval(clubId: string, id: string) {
  return (await listApprovals(clubId)).find((a) => a.id === id) ?? null;
}

export async function createApproval(clubId: string, input: Omit<Approval, "id" | "createdAt" | "status">) {
  const list = await listApprovals(clubId);
  const approval: Approval = { ...input, id: randomUUID().slice(0, 8), createdAt: new Date().toISOString().slice(0, 10), status: "väntar" };
  await write(clubId, "approvals", [approval, ...list]);
  return approval;
}

/** En produkt i materialet har anpassats i designstudion: ny bild till godkännandet och till butiken. */
export async function customizeApproval(clubId: string, id: string, productId: string, c: Customized) {
  const list = await listApprovals(clubId);
  const approval = list.find((a) => a.id === id);
  const product = approval?.products?.find((p) => p.id === productId);
  if (!approval || !product) return null;
  product.mockupUrl = c.mockupUrl;
  product.custom = { design: c.design, color: c.color };
  for (const sp of approval.shopProducts ?? []) {
    if (sp.sku.startsWith(`CRAFT-POD-${productId.toUpperCase()}-`)) sp.images = [{ url: c.mockupUrl, alt: sp.images[0]?.alt ?? sp.title, kind: "mockup" }];
  }
  await write(clubId, "approvals", list);
  return approval;
}

export async function decideApproval(clubId: string, id: string, status: Exclude<ApprovalStatus, "väntar">, note?: string) {
  const list = await listApprovals(clubId);
  const approval = list.find((a) => a.id === id);
  if (!approval) return null;
  approval.status = status;
  approval.note = note;
  approval.decidedAt = new Date().toISOString();
  let published = 0;
  if (status === "godkänd" && approval.shopProducts?.length) {
    published = (await addProducts(clubId, approval.shopProducts)).length;
  }
  await write(clubId, "approvals", list);
  return { approval, published };
}

export const listFeed = (clubId: string) => read<FeedItem[]>(clubId, "feed", () => (clubId === SEEDED ? FEED : []));

export async function addFeed(clubId: string, who: string, text: string) {
  const list = await listFeed(clubId);
  const item: FeedItem = { id: randomUUID().slice(0, 8), at: stamp(), who, text };
  await write(clubId, "feed", [item, ...list].slice(0, 50));
  return item;
}

export const readBrand = (clubId: string) => read<BrandState>(clubId, "brand", () => ({}));

/** Klubben med kansliets godkända tonalitet och ändrade färger. */
export async function withBrand(club: Club): Promise<Club> {
  const [brand, craft] = await Promise.all([readBrand(club.id), club.kind === "brand" ? null : readCraftRules()]);
  const palette = brand.palette?.length ? brand.palette : club.palette;
  const toned = brand.toneApproved && brand.tone ? { tone: brand.tone } : {};
  const rules = [
    ...club.rules,
    ...(brand.ownRules?.map((r) => `Klubben: ${r.text}`) ?? []),
    ...(brand.toneApproved ? (brand.rules ?? []) : []),
    ...(craft?.rules.map((r) => `Craft: ${r}`) ?? []),
  ];
  return { ...club, ...toned, rules, palette, crestColors: brand.palette?.length ? palette.map((c) => c.hex) : club.crestColors };
}

export async function writeBrand(clubId: string, patch: Partial<BrandState>) {
  const next = { ...(await readBrand(clubId)), ...patch };
  await write(clubId, "brand", next);
  return next;
}
