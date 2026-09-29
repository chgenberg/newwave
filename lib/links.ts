export const CHANNELS = [
  { id: "instagram", label: "Instagram (länk i bio)", medium: "social" },
  { id: "instagram-story", label: "Instagram story", medium: "social" },
  { id: "facebook", label: "Facebook", medium: "social" },
  { id: "linkedin", label: "LinkedIn", medium: "social" },
  { id: "tiktok", label: "TikTok / Reels", medium: "social" },
  { id: "nyhetsbrev", label: "Nyhetsbrev", medium: "email" },
  { id: "hemsida", label: "Hemsidebanner", medium: "banner" },
  { id: "tv", label: "TV-skärmar (QR)", medium: "screen" },
  { id: "affisch", label: "Affisch i klubbhuset (QR)", medium: "print" },
] as const;

export type ChannelId = (typeof CHANNELS)[number]["id"];

export function trackedLinks(shopUrl: string, dropId: string, clubId: string) {
  return Object.fromEntries(
    CHANNELS.map((c) => {
      const url = new URL(shopUrl);
      url.searchParams.set("utm_source", c.id);
      url.searchParams.set("utm_medium", c.medium);
      url.searchParams.set("utm_campaign", dropId);
      url.searchParams.set("utm_content", clubId);
      return [c.id, url.toString()];
    }),
  ) as Record<ChannelId, string>;
}
