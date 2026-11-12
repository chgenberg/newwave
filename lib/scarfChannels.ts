import { z } from "zod";

/**
 * Kanalerna som det valda motivet får material till: en bild eller film och en text per kanal, och utöver de sociala
 * medierna en affisch att skriva ut och en text till nyhetsbrevet.
 * Inget i den här filen behöver servern – både rutterna och gränssnittet läser den.
 */

export const CHANNELS = [
  { id: "instagram", label: "Instagram", format: "Inlägg 4:5", kind: "bild", w: 1080, h: 1350, folder: "Instagram", file: "instagram-1080x1350.jpg" },
  { id: "facebook", label: "Facebook", format: "Inlägg 1:1", kind: "bild", w: 1080, h: 1080, folder: "Facebook", file: "facebook-1080x1080.jpg" },
  { id: "linkedin", label: "LinkedIn", format: "Inlägg 1,91:1", kind: "bild", w: 1200, h: 628, folder: "LinkedIn", file: "linkedin-1200x628.jpg" },
  { id: "banner", label: "Hemsida", format: "Banner 1920 × 600", kind: "bild", w: 1920, h: 600, folder: "Hemsida", file: "banner-1920x600.jpg" },
  { id: "reels", label: "Reels", format: "Film 9:16", kind: "film", w: 1080, h: 1920, folder: "Reels", file: "reels-1080x1920.mp4" },
  { id: "tiktok", label: "TikTok", format: "Film 9:16", kind: "film", w: 1080, h: 1920, folder: "TikTok", file: "tiktok-1080x1920.mp4" },
  { id: "story", label: "Instagram händelse", format: "Bild 9:16", kind: "bild", w: 1080, h: 1920, folder: "Instagram händelse", file: "handelse-1080x1920.jpg" },
  /** A4 i 300 punkter per tum. */
  { id: "poster", label: "Affisch", format: "A4 för utskrift", kind: "bild", w: 2480, h: 3508, folder: "Affisch", file: "affisch-a4.jpg" },
  { id: "newsletter", label: "Nyhetsbrev", format: "Text", kind: "text", w: 0, h: 0, folder: "Nyhetsbrev", file: "" },
] as const;

export type Channel = (typeof CHANNELS)[number];
export type ChannelId = Channel["id"];
export type ImageChannel = Extract<Channel, { kind: "bild" }>["id"];
export type FilmChannel = Extract<Channel, { kind: "film" }>["id"];
export const IMAGE_CHANNELS = CHANNELS.filter((c) => c.kind === "bild").map((c) => c.id) as ImageChannel[];
export const FILM_CHANNELS = CHANNELS.filter((c) => c.kind === "film").map((c) => c.id) as FilmChannel[];

/** Längsta text per fält, i tecken. Modellen får samma gränser i sin instruktion. */
export const COPY_MAX = { headline: 34, subline: 60, caption: 420, post: 700, hook: 40, button: 24, alt: 160, tag: 30, subject: 60, letter: 900 } as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const tags = z.array(z.string().trim().min(1).max(COPY_MAX.tag)).max(8);

export const CopySchema = z.object({
  /** Rubriken som sätts på bilderna och i filmerna. */
  headline: text(COPY_MAX.headline),
  subline: text(COPY_MAX.subline),
  instagram: z.object({ caption: text(COPY_MAX.caption), hashtags: tags }),
  facebook: z.object({ post: text(COPY_MAX.post) }),
  linkedin: z.object({ post: text(COPY_MAX.post) }),
  banner: z.object({ headline: text(COPY_MAX.headline), subline: text(COPY_MAX.subline), button: text(COPY_MAX.button), altText: text(COPY_MAX.alt) }),
  reels: z.object({ hook: text(COPY_MAX.hook), caption: text(COPY_MAX.caption) }),
  tiktok: z.object({ hook: text(COPY_MAX.hook), caption: text(COPY_MAX.caption), hashtags: tags }),
  /** Texten till nyhetsbrevet eller medlemsmejlet. Saknas i material som sparades innan den fanns. */
  newsletter: z.object({ subject: text(COPY_MAX.subject), body: text(COPY_MAX.letter) }).optional(),
});
export type ScarfCopy = z.infer<typeof CopySchema>;

const hash = (list: string[]) => list.map((t) => `#${t.replace(/^#+/, "").replace(/\s+/g, "")}`).join(" ");

/** En länk som går att lägga i en QR-kod: http eller https och ett riktigt värdnamn. Null om den inte går att tolka. */
export function cleanLink(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(url.protocol) && /^[^.]+(\.[^.]+)+$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Länken som den skrivs ut för en människa: utan protokoll och avslutande snedstreck. */
export const linkLabel = (link: string) => link.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** Texten som står under kanalens bild eller film, och som följer med i zip-filen. `link` är dit affischens QR-kod leder. */
export function channelText(copy: ScarfCopy, id: ChannelId, link?: string | null): string {
  switch (id) {
    case "instagram":
      return [copy.instagram.caption, hash(copy.instagram.hashtags)].filter(Boolean).join("\n\n");
    case "facebook":
      return copy.facebook.post;
    case "linkedin":
      return copy.linkedin.post;
    case "banner":
      return `${copy.banner.headline}\n${copy.banner.subline}\n\nKnapp: ${copy.banner.button}\nAlt-text: ${copy.banner.altText}`;
    case "reels":
      return [copy.reels.caption, hash(copy.instagram.hashtags)].filter(Boolean).join("\n\n");
    case "tiktok":
      return [copy.tiktok.caption, hash(copy.tiktok.hashtags)].filter(Boolean).join("\n\n");
    case "story":
      return `Lägg på en länkknapp i appen med texten "${copy.banner.button}".`;
    case "poster":
      return link ? `Skriv ut i A4 och sätt upp där folk går förbi. QR-koden leder till ${linkLabel(link)}.` : "Skriv ut i A4 och sätt upp där folk går förbi. Lägg till en länk, så får affischen en QR-kod.";
    case "newsletter":
      return copy.newsletter ? `Ämnesrad: ${copy.newsletter.subject}\n\n${copy.newsletter.body}` : "";
  }
}

/** Det som blev till för det valda motivet: adresser till filerna på servern. En film som inte gick att klippa är null. */
export type ScarfMaterial = {
  /** Material som sparades innan händelsebilden och affischen fanns saknar dem. */
  images: Partial<Record<ImageChannel, string>>;
  films: Record<FilmChannel, { url: string; poster: string } | null>;
  photos: string[];
  /** Dit affischens QR-kod leder, eller null om affischen saknar kod. */
  link?: string | null;
};
