import { upcomingOccasions } from "@/lib/calendar";
import type { Signal } from "@/lib/types";

export type DemoClub = {
  id: string;
  name: string;
  fullName: string;
  initials: string;
  sections: string[];
  place: string;
  founded: number;
  website: string;
  /** Kontonamnet på Instagram. */
  handle: string;
  logo: string;
  brand: { primary: string; accent: string; onAccent: string; soft: string; headingFont: string };
};

export const ASA_IF: DemoClub = {
  id: "asa-if",
  name: "Åsa IF",
  fullName: "Åsa Idrottsförening",
  initials: "ÅIF",
  sections: ["Fotboll", "Pingis", "Innebandy"],
  place: "Åsa",
  founded: 1919,
  website: "https://www.asaif.com",
  handle: "asaif",
  logo: "/newwave/clubs/asa-if/logo.png",
  brand: { primary: "#0D0C0C", accent: "#FDEF04", onAccent: "#0D0C0C", soft: "#FFFBD6", headingFont: "Oswald" },
};

/** Klubbens konton och färger som paketvyn visar inläggen med. */
export const packClub = (club: DemoClub, colors: { primary: string; accent: string; onAccent: string }) => ({
  name: club.name,
  handle: club.handle,
  logo: club.logo,
  website: club.website,
  colors: { primary: colors.primary, accent: colors.accent, onAccent: colors.onAccent },
});

export type SeedApproval = {
  id: string;
  kind: string;
  title: string;
  occasion: string;
  createdAt: string;
  content?: { instagram: { caption: string; hashtags: string[] }; facebook: { post: string }; newsletter: { subject: string; body: string } };
};

export const APPROVALS: SeedApproval[] = [
  {
    id: "a1",
    kind: "Instagram-inlägg",
    title: "Guld till F2014 i Quality Hotel Cup",
    occasion: "Klubbnyhet",
    createdAt: "2026-10-16",
    content: {
      instagram: {
        caption: "Två guld! 🥇🥇 F2014 tog hem Quality Hotel Cup – stolta ledare, glada spelare och en hel by som hejar. Grattis tjejer!",
        hashtags: ["åsaif", "f2014", "qualityhotelcup", "ungdomsfotboll", "åsa"],
      },
      facebook: { post: "Vilken helg! F2014 vann två guld i Quality Hotel Cup. Tack till ledare och föräldrar som gör det möjligt – det här är Åsa IF när vi är som bäst." },
      newsletter: { subject: "Två guld till F2014", body: "F2014 tog två guld i Quality Hotel Cup i helgen. Stort grattis till spelare, ledare och föräldrar!" },
    },
  },
  {
    id: "a2",
    kind: "Nyhetsbrev",
    title: "Åsabladet – november",
    occasion: "Åsabladet",
    createdAt: "2026-10-15",
    content: {
      instagram: { caption: "Nya Åsabladet är ute – Öppen hall varje fredag, Fars dag och julklappstips i svart och gult. 💛🖤", hashtags: ["åsaif", "åsabladet", "åsa"] },
      facebook: { post: "Novembernumret av Åsabladet är här: Öppen hall i innebandy varje fredag 16–17.30, Fars dag-hälsningar och klubbens julklappar." },
      newsletter: {
        subject: "Åsabladet – november",
        body: "Hej Åsa IF-vän!\n\nVarje fredag 16–17.30 är hallen öppen för innebandy – alla åldrar, gratis mellanmål. Den 8 november firar vi alla pappor vid sidlinjen, i pingishallen och i innebandyn.\n\nJulklapparna i svart och gult finns i klubbens butik – varje köp stöttar föreningen.\n\nVi ses i hallen!",
      },
    },
  },
  { id: "a3", kind: "Tryckfil", title: "Åsa Cupen-tröja 2026", occasion: "Åsa Cupen", createdAt: "2026-10-14" },
];

export type FeedItem = { id: string; at: string; who: string; text: string };

export const FEED: FeedItem[] = [
  { id: "f1", at: "2026-10-16 14:12", who: "Signalagenten", text: "Hittade nyheten om F2014:s två guld i Quality Hotel Cup på asaif.com." },
  { id: "f2", at: "2026-10-16 14:15", who: "Contentagenten", text: "Skapade inlägg och story om guldet – granskat mot klubbens färger." },
  { id: "f3", at: "2026-10-15 09:30", who: "Utskicksagenten", text: "Skickade Åsabladet för november för godkännande." },
  { id: "f4", at: "2026-10-14 16:45", who: "Designagenten", text: "Tog fram tryckfil och mockup för Åsa Cupen-tröjan i svart och gult." },
];

/** Kalenderns texter är skrivna för IFK Göteborg; en breddklubb får egna. */
const GRASSROOTS_DETAIL: Record<string, string> = {
  "alla-hjartans": "Kärlek till klubben – familj, lagkompisar och ledare.",
  valborg: "Vårkänslor och första träningarna på gräs.",
  "mors-dag": "Mammor som skjutsat, hejat och tvättat matchställ.",
  nationaldagen: "Sverige, sommarlov och cuper.",
  halloween: "Läskigt bra – spöken, pumpor och knattefotboll.",
  "fars-dag": "Pappor som står vid sidlinjen – på fotbollen, i pingishallen och i innebandyn.",
  "black-friday": "Årets största shoppinghelg – julklappar i svart och gult.",
};

const SKIP = new Set(["allsvenskan-premiar", "allsvenskan-final"]);

export type ClubOccasion = Signal & { own?: boolean };

/** Högtider för gräsrotsklubbar; `own` lägger till Åsas egna återkommande aktiviteter. */
export function clubOccasions(now: Date, windowDays = 90, own = true): ClubOccasion[] {
  const base = upcomingOccasions(now, windowDays)
    .map((o) => ({ o, key: o.id.replace(/-\d{4}$/, "") }))
    .filter(({ key }) => !SKIP.has(key))
    .map(({ o, key }) => ({ ...o, detail: GRASSROOTS_DETAIL[key] ?? o.detail }));
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const toFriday = (5 - new Date(start).getUTCDay() + 7) % 7;
  const weekly: ClubOccasion[] = [
    {
      id: "oppen-hall",
      kind: "club",
      title: "Öppen hall – innebandy",
      detail: "Varje fredag 16–17.30. Alla åldrar, gratis mellanmål.",
      date: new Date(start + toFriday * 86_400_000).toISOString().slice(0, 10),
      daysUntil: toFriday,
      own: true,
    },
  ];
  return [...base, ...(own ? weekly : [])].sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
}

export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

/** Veckans signaler för söndagskörningen: det som händer de närmaste tre veckorna. */
export function weeklySignals(now: Date) {
  const near = clubOccasions(now, 21);
  return (near.length ? near : clubOccasions(now, 90)).slice(0, 3);
}

export function occasionStatus(signal: Signal): { label: string; tone: "dark" | "mid" | "light" } {
  const days = signal.daysUntil ?? 999;
  if (days <= 21) return { label: "Material klart", tone: "dark" };
  if (days <= 50) return { label: "Brief klar", tone: "mid" };
  return { label: "Planeras", tone: "light" };
}
