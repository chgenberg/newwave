import { createHash } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import { generateJson } from "./openai";
import { CHANNELS, COPY_MAX, CopySchema, channelText, type ChannelId, type FilmChannel, type ImageChannel, type ScarfCopy } from "./scarfChannels";
import type { ScarfClub } from "./scarfClub";
import { facePreview } from "./scarfEngine";
import { PHOTO_FILE, clubCrest, knitIdea, type KnitResult, type ScarfFiles } from "./scarfFlow";
import { lookOf, mediaFonts, sortPhotos, type MediaInput } from "./scarfMedia";
import { buildPackage, slug } from "./scarfProduction";
import { PERSONAL, RECIPES, type ScarfIdea } from "./scarfRecipes";
import { loadFile } from "./store";
import type { Club } from "./types";

/**
 * Materialet för det valda motivet: texterna per kanal, underlaget som bilderna och filmerna sätts av, och zip-filen
 * med allt. Bilderna ritas i scarfMedia.ts, filmerna klipps i scarfFilm.ts och fotografierna tas i scarfPhoto.ts.
 */

// --- Texterna -------------------------------------------------------------------

const str = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const list = { type: "array", items: str };

const copySchema = obj({
  headline: str,
  subline: str,
  instagram: obj({ caption: str, hashtags: list }),
  facebook: obj({ post: str }),
  linkedin: obj({ post: str }),
  banner: obj({ headline: str, subline: str, button: str, altText: str }),
  reels: obj({ hook: str, caption: str }),
  tiktok: obj({ hook: str, caption: str, hashtags: list }),
});

const sides = (idea: ScarfIdea) => {
  const text = (s: { main: string; sub: string }) => [s.main, s.sub].filter(Boolean).join(" / ") || "ingen text";
  return `Framsida: ${text(idea.front)}. Baksida: ${text(idea.back)}.`;
};

/** Kortar en text vid ett ordslut, så att den ryms i fältet. */
function clamp(raw: unknown, max: number, fallback: string) {
  const s = typeof raw === "string" ? raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!s) return fallback;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return (cut.lastIndexOf(" ") > max * 0.6 ? cut.slice(0, cut.lastIndexOf(" ")) : cut).replace(/[\s,;:–-]+$/, "");
}

const tagList = (raw: unknown, fallback: string[]) => {
  const tags = Array.isArray(raw) ? raw.map((t) => String(t).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, COPY_MAX.tag)).filter(Boolean) : [];
  return (tags.length ? [...new Set(tags)] : fallback).slice(0, 8);
};

/** Rättar modellens texter till fältens längder. Det som saknas fylls från mallen. */
function tidy(raw: Partial<ScarfCopy> | null, base: ScarfCopy): ScarfCopy {
  const r = raw ?? {};
  const copy: ScarfCopy = {
    headline: clamp(r.headline, COPY_MAX.headline, base.headline).replace(/[.!]+$/, ""),
    subline: clamp(r.subline, COPY_MAX.subline, base.subline),
    instagram: { caption: clamp(r.instagram?.caption, COPY_MAX.caption, base.instagram.caption), hashtags: tagList(r.instagram?.hashtags, base.instagram.hashtags) },
    facebook: { post: clamp(r.facebook?.post, COPY_MAX.post, base.facebook.post) },
    linkedin: { post: clamp(r.linkedin?.post, COPY_MAX.post, base.linkedin.post) },
    banner: {
      headline: clamp(r.banner?.headline, COPY_MAX.headline, base.banner.headline).replace(/[.!]+$/, ""),
      subline: clamp(r.banner?.subline, COPY_MAX.subline, base.banner.subline),
      button: clamp(r.banner?.button, COPY_MAX.button, base.banner.button).replace(/[.!]+$/, ""),
      altText: clamp(r.banner?.altText, COPY_MAX.alt, base.banner.altText),
    },
    reels: { hook: clamp(r.reels?.hook, COPY_MAX.hook, base.reels.hook), caption: clamp(r.reels?.caption, COPY_MAX.caption, base.reels.caption) },
    tiktok: { hook: clamp(r.tiktok?.hook, COPY_MAX.hook, base.tiktok.hook), caption: clamp(r.tiktok?.caption, COPY_MAX.caption, base.tiktok.caption), hashtags: tagList(r.tiktok?.hashtags, base.tiktok.hashtags) },
  };
  const checked = CopySchema.safeParse(copy);
  return checked.success ? checked.data : base;
}

const tag = (s: string) => s.toLocaleLowerCase("sv-SE").replace(/[^\p{L}\p{N}]/gu, "");

/** Texter fyllda från klubben och idén – när ingen språkmodell är kopplad, och som reserv för fält modellen lämnar tomma. */
export function demoScarfCopy(club: Club, idea: ScarfIdea): ScarfCopy {
  const brand = club.kind === "brand";
  const where = brand ? "Finns att beställa hos oss." : "Finns i klubbshoppen.";
  const tags = [...new Set([tag(club.shortName || club.name), tag(club.name), brand ? "halsduk" : "supporterhalsduk", "stickat", tag(club.city)].filter(Boolean))];
  const headline = clamp(`${idea.title} är här`, COPY_MAX.headline, "Ny halsduk");
  return {
    headline,
    subline: "Stickad halsduk med fransar, 135 cm lång.",
    instagram: { caption: `${idea.title} – ${club.name}s nya stickade halsduk. ${idea.why} Länk i bio.`.slice(0, COPY_MAX.caption), hashtags: tags },
    facebook: { post: clamp(`Nu är den här: ${idea.title}, ${club.name}s nya stickade halsduk. ${idea.why} ${where}`, COPY_MAX.post, where) },
    linkedin: { post: clamp(`${club.name} släpper en ny stickad halsduk: ${idea.title}. ${idea.why} Halsduken är stickad i jacquard, 135 cm lång, med olika text på fram- och baksidan.`, COPY_MAX.post, where) },
    banner: { headline: "Ny halsduk", subline: clamp(idea.title, COPY_MAX.subline, "Stickad i våra färger"), button: "Beställ halsduken", altText: clamp(`${club.name}s stickade halsduk ${idea.title}, fram- och baksida.`, COPY_MAX.alt, "Stickad halsduk") },
    reels: { hook: "Ny halsduk", caption: clamp(`${idea.title} – stickad i våra färger. Länk i bio.`, COPY_MAX.caption, "Länk i bio.") },
    tiktok: { hook: "Den här vill du ha", caption: clamp(`${idea.title}. Länk i bio.`, COPY_MAX.caption, "Länk i bio."), hashtags: tags.slice(0, 4) },
  };
}

/** Agenten skriver en text per kanal för det valda motivet. */
export async function createScarfCopy(club: Club, idea: ScarfIdea, signal?: { title: string; detail: string }): Promise<ScarfCopy> {
  const brand = club.kind === "brand";
  const personal = PERSONAL.includes(idea.recipe);
  const where = brand ? "Finns att beställa hos oss." : "Finns i klubbshoppen.";
  const colors = (["ground", "ink", "accent"] as const).map((k) => club.palette.find((c) => c.hex.toUpperCase() === idea.colors[k].toUpperCase())?.name ?? idea.colors[k]);
  const system = `Du skriver ${club.name}s egna texter när ${brand ? "företaget" : "klubben"} släpper en ny stickad halsduk. ${brand ? "Marknadsavdelningen" : "Kansliet"} ska kunna publicera dem som de står: en text per kanal, till en bild eller film som redan är gjord.
Tonalitet: ${club.tone}
Skriv på svenska, som en människa ${brand ? "på företaget" : "i klubben"} – varmt, kort och konkret. Ingen reklamjargong och inga utropstecken på rad.

Det här vet du om halsduken och får säga: den är stickad i jacquard, cirka 135 × 18 cm, med fransar och olika text på fram- och baksidan.
Hitta inte på något annat: inga priser, rabatter, datum, antal, leveranstider, material eller länkar. Nämn inga personer vid namn${personal ? " – namn, nummer och ansikten på halsduken är exempel som byts ut" : ""}. Nämn inte stickeriet och inte hur halsduken har tagits fram.
${brand ? "Varumärkets" : "Klubbens"} regelbok gäller även texterna:
${club.rules.filter((r) => !/DTG|digitaltryck/i.test(r)).map((r) => `- ${r}`).join("\n")}

Fält:
- headline: rubriken som sätts stort på bilderna och i filmerna. 2–4 ord, högst ${COPY_MAX.headline - 4} tecken, utan punkt.
- subline: en rad under rubriken, högst 8 ord.
- instagram.caption: högst 300 tecken, 1–2 emojis, avslutas med "Länk i bio." hashtags: 5–8 stycken utan # och utan mellanslag.
- facebook.post: 2–4 meningar, varm och inkluderande, ${brand ? "till kunder och medarbetare" : "till medlemmar, familjer och supportrar"}. Sista meningen är "${where}"
- linkedin.post: 3–5 meningar i professionell ton, ${brand ? "om varför företaget gör en egen halsduk och vad den betyder för kunder och medarbetare" : "till sponsorer och partners: vad halsduken betyder för föreningen och gemenskapen runt den"}.
- banner: hemsidans banner. headline högst 5 ord, subline högst 10 ord, button högst 3 ord (till exempel "Beställ halsduken"), altText en mening som beskriver bilden för den som inte ser den.
- reels.hook: texten i filmens första sekund, högst 5 ord. reels.caption: högst 200 tecken, avslutas med "Länk i bio."
- tiktok.hook: högst 6 ord, rakare och mer lekfull än i Reels. tiktok.caption: högst 150 tecken, avslutas med "Länk i bio." tiktok.hashtags: 3–5 stycken utan #.
Om signalen kommer från en nyhet: bygg på det som hänt, men citera inte artikeln och nämn inte tidningen.`;

  const user = `Halsduken "${idea.title}" (${RECIPES[idea.recipe].label}). Idén: ${idea.why}
Signal: ${signal ? `${signal.title} – ${signal.detail}` : idea.signal}
${sides(idea)}
Färger: botten ${colors[0]}, text ${colors[1]}, detalj ${colors[2]}.
${brand ? "Företag" : "Klubb"}: ${club.name}${club.city ? `, ${club.city}` : ""}.${club.nicknames.length ? ` ${brand ? "Namn" : "Smeknamn"} som får användas: ${club.nicknames.join(", ")}.` : ""}
Dagens datum: ${new Date().toISOString().slice(0, 10)}.`;

  const raw = await generateJson<Partial<ScarfCopy>>({ system, user, schemaName: "scarf_copy", schema: copySchema });
  return tidy(raw, demoScarfCopy(club, idea));
}

// --- Underlaget till bilder och filmer -----------------------------------------------

type Faces = { result: KnitResult; front: Buffer; back: Buffer };

/** Bilderna, de två filmerna och zip-filen behöver samma stickade halsduk: den stickas en gång och sparas en stund. */
const knitted = new Map<string, Promise<Faces>>();

function faces(found: ScarfClub, idea: ScarfIdea, files: ScarfFiles): Promise<Faces> {
  const key = createHash("sha1").update(JSON.stringify([found.ref, idea, files.artFile ?? null, files.photoFile ?? null, files.signFile ?? null])).digest("hex");
  let hit = knitted.get(key);
  if (!hit) {
    if (knitted.size >= 6) knitted.delete(knitted.keys().next().value as string);
    hit = (async () => {
      const result = await knitIdea(found.club, idea, { ...files, crest: found.crest });
      // I full storlek: sex gånger åtta bildpunkter per maska, så att maskorna syns i filmernas närbilder.
      const [front, back] = await Promise.all(result.knit.faces.map((f) => facePreview(f, result.knit.palette, 7560)));
      return { result, front, back };
    })();
    hit.catch(() => knitted.delete(key));
    knitted.set(key, hit);
  }
  return hit;
}

const crestOf = async (found: ScarfClub) => {
  const raw = found.crest !== undefined ? found.crest : await clubCrest(found.club);
  return raw ? sharp(raw).png().toBuffer().catch(() => null) : null;
};

export async function photoBuffers(ids: string[]) {
  const loaded = await Promise.all(ids.filter((id) => PHOTO_FILE.test(id)).map((id) => loadFile(id)));
  return loaded.flatMap((f) => (f ? [f.data] : []));
}

/** Framsidan som den blir stickad – referensen fotografen får. */
export async function frontOf(found: ScarfClub, idea: ScarfIdea, files: ScarfFiles) {
  return (await faces(found, idea, files)).front;
}

/** Allt som bilderna och filmerna sätts av. */
export async function mediaFor(found: ScarfClub, idea: ScarfIdea, files: ScarfFiles, copy: ScarfCopy, photos: string[]): Promise<MediaInput> {
  const [knit, crest, fonts, shots] = await Promise.all([faces(found, idea, files), crestOf(found), mediaFonts(idea), photoBuffers(photos)]);
  return { name: found.club.name, crest, look: lookOf(found.club, idea), front: knit.front, back: knit.back, photos: await sortPhotos(shots), copy, fonts };
}

// --- Zip-filen ----------------------------------------------------------------------

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim().replace(/[.\s]+$/, "");

export type MaterialFiles = { images: Record<ImageChannel, string>; films: Record<FilmChannel, { file: string; poster: string } | null>; photos: string[] };

/**
 * Allt material i en zip: en mapp per kanal med bilden eller filmen och texten, fotografierna, halsdukens båda sidor
 * och stickfilerna. `pdf` gör stickordern till PDF; utan den följer stickordern med som data.
 */
export async function materialZip(input: { found: ScarfClub; idea: ScarfIdea; files: ScarfFiles; copy: ScarfCopy; material: MaterialFiles; pdf?: (html: string) => Promise<Buffer> }) {
  const { found, idea, copy, material } = input;
  const date = new Date().toISOString().slice(0, 10);
  const knit = await faces(found, idea, input.files);
  const zip = new JSZip();
  const root = zip.folder(safe(`${found.club.name} – ${idea.title}`) || "Material")!;
  const missing: string[] = [];

  const fileOf: Record<ChannelId, string | null> = { ...material.images, reels: material.films.reels?.file ?? null, tiktok: material.films.tiktok?.file ?? null };
  for (const ch of CHANNELS) {
    const folder = root.folder(ch.folder)!;
    const id = fileOf[ch.id];
    const data = id ? ((await loadFile(id))?.data ?? null) : null;
    if (data) folder.file(ch.file, data);
    else missing.push(ch.label);
    if (ch.kind === "film") {
      const poster = material.films[ch.id]?.poster;
      const cover = poster ? ((await loadFile(poster))?.data ?? null) : null;
      if (cover) folder.file("omslag.jpg", cover);
    }
    folder.file("text.txt", `${channelText(copy, ch.id)}\n`);
  }

  const pictures = root.folder("Bilder")!;
  const photos = await photoBuffers(material.photos);
  photos.forEach((buf, i) => pictures.file(`foto-${i + 1}.jpg`, buf));
  const flat = (face: Buffer) => sharp(face).resize({ width: 3000 }).flatten({ background: "#FFFFFF" }).jpeg({ quality: 92 }).toBuffer();
  pictures.file("halsduk-framsida.jpg", await flat(knit.front));
  pictures.file("halsduk-baksida.jpg", await flat(knit.back));

  let factory = false;
  try {
    const { result } = knit;
    const pack = await buildPackage({ club: found.club.name, title: idea.title, why: idea.why, front: result.front, back: result.back, consent: result.built.consent, knit: result.knit, report: result.report, date, pdf: input.pdf });
    const folder = root.folder("Stickfiler")!;
    for (const f of pack.files) folder.file(f.name, f.data);
    factory = true;
  } catch (err) {
    console.error("scarfContent stickfiler", err instanceof Error ? err.message : err);
  }

  const lines = [
    `${found.club.name} – ${idea.title}`,
    `Material för sociala medier och hemsida, skapat ${date}.`,
    "",
    "Varje mapp är en kanal: bilden eller filmen, och texten att klistra in (text.txt).",
    "",
    ...CHANNELS.map((ch) => `${ch.folder} – ${ch.file}${ch.kind === "film" ? " (tio sekunder, utan ljud – lägg på ett ljud i appen). omslag.jpg är omslagsbilden." : ch.id === "banner" ? ". Knappens text och bildens alt-text står i text.txt." : ""}`),
    `Bilder – ${photos.length ? "fotografierna och " : ""}halsdukens fram- och baksida som de blir stickade.`,
    ...(factory ? ["Stickfiler – underlaget till stickeriet."] : []),
    "",
    "Att tänka på",
    ...(photos.length ? ["- Personerna på fotografierna finns inte. Bilderna är skapade av en bildmodell utifrån halsdukens mönster. Märk dem som AI-skapade där kanalen kräver det."] : []),
    ...(knit.result.built.consent ? [`- ${knit.result.built.consent} Namn, nummer, ansikten och namnteckningar i materialet är exempel tills dess.`] : []),
    "- Texterna är förslag. Läs igenom dem och lägg till er egen länk innan ni publicerar.",
    ...(missing.length ? [`- Saknas i den här zip-filen: ${missing.join(", ")}.`] : []),
    "",
  ];
  root.file("LÄS MIG.txt", lines.join("\n"));

  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } });
  return { data, name: `material-${slug(found.club.name)}-${slug(idea.title)}-${date}.zip` };
}
