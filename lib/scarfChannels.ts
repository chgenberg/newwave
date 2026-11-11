import { z } from "zod";

/**
 * Kanalerna som det valda motivet får material till: en bild eller film och en text per kanal.
 * Inget i den här filen behöver servern – både rutterna och gränssnittet läser den.
 */

export const CHANNELS = [
  { id: "instagram", label: "Instagram", format: "Inlägg 4:5", kind: "bild", w: 1080, h: 1350, folder: "Instagram", file: "instagram-1080x1350.jpg" },
  { id: "facebook", label: "Facebook", format: "Inlägg 1:1", kind: "bild", w: 1080, h: 1080, folder: "Facebook", file: "facebook-1080x1080.jpg" },
  { id: "linkedin", label: "LinkedIn", format: "Inlägg 1,91:1", kind: "bild", w: 1200, h: 628, folder: "LinkedIn", file: "linkedin-1200x628.jpg" },
  { id: "banner", label: "Hemsida", format: "Banner 1920 × 600", kind: "bild", w: 1920, h: 600, folder: "Hemsida", file: "banner-1920x600.jpg" },
  { id: "reels", label: "Reels", format: "Film 9:16", kind: "film", w: 1080, h: 1920, folder: "Reels", file: "reels-1080x1920.mp4" },
  { id: "tiktok", label: "TikTok", format: "Film 9:16", kind: "film", w: 1080, h: 1920, folder: "TikTok", file: "tiktok-1080x1920.mp4" },
] as const;

export type Channel = (typeof CHANNELS)[number];
export type ChannelId = Channel["id"];
export type ImageChannel = Extract<Channel, { kind: "bild" }>["id"];
export type FilmChannel = Extract<Channel, { kind: "film" }>["id"];
export const IMAGE_CHANNELS = CHANNELS.filter((c) => c.kind === "bild").map((c) => c.id) as ImageChannel[];
export const FILM_CHANNELS = CHANNELS.filter((c) => c.kind === "film").map((c) => c.id) as FilmChannel[];

/** Längsta text per fält, i tecken. Modellen får samma gränser i sin instruktion. */
export const COPY_MAX = { headline: 34, subline: 60, caption: 420, post: 700, hook: 40, button: 24, alt: 160, tag: 30 } as const;

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
});
export type ScarfCopy = z.infer<typeof CopySchema>;

const hash = (list: string[]) => list.map((t) => `#${t.replace(/^#+/, "").replace(/\s+/g, "")}`).join(" ");

/** Texten som står under kanalens bild eller film, och som följer med i zip-filen. */
export function channelText(copy: ScarfCopy, id: ChannelId): string {
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
  }
}

/** Det som blev till för det valda motivet: adresser till filerna på servern. En film som inte gick att klippa är null. */
export type ScarfMaterial = {
  images: Record<ImageChannel, string>;
  films: Record<FilmChannel, { url: string; poster: string } | null>;
  photos: string[];
};
