import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import sharp from "sharp";
import { z } from "zod";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { hasClubLink, LINK_COOKIE } from "./clubLink";
import { registryPhoto } from "./clubRegistry";
import { genitive } from "./newsletterHtml";
import { readData, updateJson } from "./workspace";

/**
 * Det klubben själv skriver och visar i sin butik: rubriken, ingressen, raden i klubbshoppen hos Intersport, om
 * klubben, kontaktuppgifterna, fotot överst och varor som inte ska synas. Delas av alla, som klubbens val för
 * ordmärkena, så att det klubben ändrar via sin länk syns för supportrarna.
 */
const FILE = "newwave/clubshop/content.json";
const PHOTO_DIR = path.join(process.cwd(), ".data", "newwave", "clubshop", "photos");
const ID = /^[a-z0-9-]{1,80}$/;
const ITEM = /^[a-z0-9-]{1,120}$/;
export const PHOTO_FILE = /^foto-\d{13}\.jpg$/;
export const PHOTO_MAX_BYTES = 10_000_000;
export const TEXT_MAX = { headline: 60, intro: 260, tagline: 80, about: 600, contact: 200, email: 120, phone: 20 } as const;
export type TextKey = keyof typeof TEXT_MAX;
const TEXT_KEYS = Object.keys(TEXT_MAX) as TextKey[];

const Text = (max: number) => z.string().trim().max(max).regex(/^[^<>\u0000-\u001f]*$/);
/** Tomt betyder att fältet tas bort. */
const TEXTS = {
  headline: Text(TEXT_MAX.headline),
  intro: Text(TEXT_MAX.intro),
  tagline: Text(TEXT_MAX.tagline),
  about: Text(TEXT_MAX.about),
  contact: Text(TEXT_MAX.contact),
  email: z.union([z.literal(""), z.string().trim().max(TEXT_MAX.email).email()]),
  phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[\d\s-]{6,20}$/)]),
};

const Texts = z.object(TEXTS).partial();

const ContentSchema = Texts.extend({
  /** Klubbens uppladdade foto; utan det visas bilden från webbplatsen, om inte `photoOff`. */
  photo: z.string().regex(PHOTO_FILE).optional(),
  photoOff: z.boolean().optional(),
  hidden: z.array(z.string().regex(ITEM)).max(200).default([]),
  updatedAt: z.string().optional(),
});
export type ShopContent = z.infer<typeof ContentSchema>;

export const ContentPatch = Texts.extend({
  photo: z.enum(["hemsidan", "ingen"]).optional(),
  hidden: z.array(z.string().regex(ITEM)).max(200).optional(),
});
export type ContentPatchT = z.infer<typeof ContentPatch>;

type All = Record<string, unknown>;

export async function readContent(id: string): Promise<ShopContent> {
  try {
    const r = ContentSchema.safeParse((JSON.parse((await readData(FILE, { shared: true })) ?? "{}") as All)[id]);
    return r.success ? r.data : { hidden: [] };
  } catch {
    return { hidden: [] };
  }
}

async function update(id: string, change: (cur: ShopContent) => ShopContent) {
  if (!ID.test(id)) throw new Error("Okänd klubb");
  let out: ShopContent = { hidden: [] };
  await updateJson<All>(
    FILE,
    {},
    (all) => {
      const r = ContentSchema.safeParse(all[id]);
      out = { ...change(r.success ? r.data : { hidden: [] }), updatedAt: new Date().toISOString() };
      return { ...all, [id]: out };
    },
    { shared: true },
  );
  return out;
}

/** Tomma texter betyder butikens egna. */
export function writeContent(id: string, patch: ContentPatchT) {
  return update(id, (cur) => {
    const next = { ...cur };
    for (const k of TEXT_KEYS) if (patch[k] !== undefined) next[k] = patch[k] || undefined;
    if (patch.hidden) next.hidden = [...new Set(patch.hidden)];
    if (patch.photo) {
      if (cur.photo) void removePhoto(id, cur.photo);
      next.photo = undefined;
      next.photoOff = patch.photo === "ingen";
    }
    return next;
  });
}

/** Fotot sparas som jpeg utan metadata (platsen där det togs följer annars med), högst 2000 px brett. */
export async function savePhoto(id: string, bytes: Buffer) {
  if (!ID.test(id)) throw new Error("Okänd klubb");
  const img = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
  const meta = await img.metadata();
  if ((meta.width ?? 0) < 600 || (meta.height ?? 0) < 300) throw new Error("Bilden behöver vara minst 600 × 300 pixlar.");
  const jpeg = await img.resize({ width: 2000, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const file = `foto-${Date.now()}.jpg`;
  await mkdir(path.join(PHOTO_DIR, id), { recursive: true });
  await writeFile(path.join(PHOTO_DIR, id, file), jpeg);
  return update(id, (cur) => {
    if (cur.photo) void removePhoto(id, cur.photo);
    return { ...cur, photo: file, photoOff: false };
  });
}

const removePhoto = (id: string, file: string) => rm(path.join(PHOTO_DIR, id, file), { force: true }).catch(() => undefined);

export const readPhoto = (id: string, file: string) => (ID.test(id) && PHOTO_FILE.test(file) ? readFile(path.join(PHOTO_DIR, id, file)).catch(() => null) : Promise.resolve(null));

/** Fotot överst i butiken: klubbens eget, annars bilden från webbplatsen. */
export async function shopPhoto(id: string, c: ShopContent) {
  if (c.photo) return `/api/v1/newwave/clubshop/${id}/foto/${c.photo}`;
  return c.photoOff ? undefined : registryPhoto(id);
}

/** Butikens texter, med klubbens egna där de finns. */
export function shopTexts(club: { name: string; tagline?: string }, c: ShopContent) {
  return {
    headline: c.headline || `Bär ${club.name}.`,
    intro: c.intro || `Tröjor, hoodies, kepsar och mer med ${genitive(club.name)} namn, färger och märke – i vintagestil, tryckta på beställning för dig.`,
    tagline: c.tagline || club.tagline || "Klubbens kollektion",
  };
}

/** Om besökaren får ändra butiken: Next Wave med demolösenordet, eller klubben via sin egen länk. */
export async function canEditShop(id: string) {
  const jar = await cookies();
  return (await hasAccess(jar.get(ACCESS_COOKIE)?.value)) || hasClubLink(id, jar.get(LINK_COOKIE.club)?.value);
}
