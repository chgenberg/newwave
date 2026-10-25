import type { Club } from "@/lib/types";
import { intersportPath } from "@/lib/intersport";
import { clubOccasions } from "./club";
import { loadClubShop, mockupUrl, wordmarkSpec } from "./clubShop";
import { genitive } from "./newsletterHtml";

/**
 * Klubbens agent i mobilen: klubben skriver eller skickar en bild, agenten svarar med ett färdigt inlägg i klubbens
 * färger och tipsar om varor i shoppen. Bara texten görs av AI – bilden ritas av webbläsaren ur klubbens märke och färger.
 */

export type PostFormat = "resultat" | "match" | "nyhet" | "shop";

export type AgentPost = {
  format: PostFormat;
  kicker: string;
  title: string;
  score: { us: number; them: number } | null;
  opponent: string | null;
  home: boolean | null;
  detail: string;
  team: string | null;
  caption: string;
  hashtags: string[];
  product: string | null;
  when: string;
};

export type AgentReply = { reply: string; post: AgentPost | null; merch: { item: string; pitch: string } | null; quick: string[] };

export type ShopPick = { id: string; name: string; price: number; mockup: string; href: string };

const SHOP_PICKS = 10;

/** Varorna agenten får tipsa om: klubbens utvalda först, sedan kollektionerna. */
export async function agentShop(clubId: string): Promise<ShopPick[]> {
  const shop = await loadClubShop(clubId);
  if (!shop) return [];
  return shop.groups
    .flatMap((g) => g.items)
    .slice(0, SHOP_PICKS)
    .map((i) => ({ id: i.id, name: i.name, price: i.product.priceSek, mockup: mockupUrl(i.product, wordmarkSpec(i.template.id, i.worn), clubId, shop.v, 800), href: intersportPath(clubId, i.id) }));
}

const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "long", day: "numeric", month: "long" });
const when = (iso: string) => day.format(new Date(`${iso}T12:00:00Z`));

/** Agentens första meddelande, utan AI: det som händer härnäst i klubben. */
export function agentOpener(club: Club, now = new Date()) {
  const next = clubOccasions(now, 30)[0];
  const nudge = next?.date ? ` ${next.daysUntil === 0 ? "I dag" : `På ${when(next.date).split(" ")[0]}`} är det ${next.title} – ska jag göra ett inlägg om det?` : "";
  return {
    text: `Hej! Jag är ${club.agent.name}. Skicka en bild från matchen eller skriv vad som hänt, så gör jag inlägget i klubbens färger.${nudge}`,
    quick: ["Vi vann 3–1 mot Fjärås! Elsa gjorde två mål", "Hemmamatch lördag 14:00 mot Kungsbacka", ...(next ? [`Gör ett inlägg om ${next.title}`] : []), "Tipsa om något i shoppen"],
  };
}

export function agentSystem(club: Club, handle: string, shop: ShopPick[], now = new Date()) {
  const occasions = clubOccasions(now, 45).slice(0, 5);
  return `Du är ${club.agent.name}, ${genitive(club.name)} agent i mobilen. Ledare, kansli och föräldrar skriver till dig som i WhatsApp – ofta snabbt, från läktaren. Du gör färdiga inlägg för Instagram och Facebook och tipsar om varor i klubbens shop hos Intersport.

I dag är det ${day.format(now)}. Svara alltid på svenska.

Klubben: ${club.name}, grundad ${club.founded} i ${club.city}, hemmaplan ${club.arena}. Sektioner: fotboll, pingis och innebandy. Instagram: @${handle}.
Tonalitet: ${club.tone}
Regelbok (följ alltid): ${club.rules.filter((r) => !/DTG|tryck/i.test(r)).join(" ")}

Kommande i klubben: ${occasions.map((o) => `${o.title}${o.date ? ` (${when(o.date)})` : ""} – ${o.detail}`).join("; ") || "inget särskilt"}.
Varor i shoppen (id: namn, pris): ${shop.map((s) => `${s.id}: ${s.name}, ${s.price} kr`).join("; ")}.

Så svarar du:
- reply: ett kort chattsvar, högst två meningar, varmt och enkelt. Inga rubriker eller listor.
- post: ett färdigt inlägg när det finns något att posta. format är "resultat" (en spelad match, kräver resultat och motståndare), "match" (en kommande match eller aktivitet), "nyhet" (allt annat i klubben) eller "shop" (en vara ur shoppen, product är varans id). kicker är en kort etikett i versaler (högst 16 tecken, t.ex. "SLUTRESULTAT", "HEMMAMATCH", "KLUBBNYHET", "NYTT I SHOPPEN"). title är rubriken, högst 28 tecken. score är {us, them} med ${genitive(club.name)} mål i us, bara för resultat. home är true om ${club.name} spelade hemma. detail är en rad med plats, tid eller lag (högst 48 tecken). team är laget eller sektionen om den nämns, annars null. caption är inläggets text, en till tre korta meningar. hashtags är 3–6 ord utan #, med gemener. when är bästa tid att publicera, t.ex. "Nu", "I kväll 19:00" eller "Fredag 08:00".
- Hitta aldrig på resultat, motståndare, tider eller platser. Saknas något som behövs, ställ en kort fråga i reply och sätt post till null.
- Skriv aldrig barns eller spelares namn eller nummer i inlägget, inte ens om de nämns. Säg då kort i reply att namnen är utelämnade enligt klubbens regelbok.
- Vill de ändra något, gör om hela inlägget med ändringen.
- Har de skickat en bild hamnar den i inlägget – beskriv inte bilden, du ser den inte. Appen påminner själv om föräldrarnas godkännande, så det behöver du inte göra.
- merch: tipsa om en vara bara när det passar naturligt (seger, cup, högtid, kyla, jul) och högst varannan gång, med en mening i pitch. item är varans id. Annars null.
- quick: två eller tre korta förslag (högst 36 tecken) på vad de kan skriva härnäst.
- Emojis bara 💛 och 🖤.`;
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

export const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "post", "merch", "quick"],
  properties: {
    reply: { type: "string" },
    post: nullable({
      type: "object",
      additionalProperties: false,
      required: ["format", "kicker", "title", "score", "opponent", "home", "detail", "team", "caption", "hashtags", "product", "when"],
      properties: {
        format: { type: "string", enum: ["resultat", "match", "nyhet", "shop"] },
        kicker: { type: "string" },
        title: { type: "string" },
        score: nullable({ type: "object", additionalProperties: false, required: ["us", "them"], properties: { us: { type: "integer" }, them: { type: "integer" } } }),
        opponent: { type: ["string", "null"] },
        home: { type: ["boolean", "null"] },
        detail: { type: "string" },
        team: { type: ["string", "null"] },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        product: { type: ["string", "null"] },
        when: { type: "string" },
      },
    }),
    merch: nullable({ type: "object", additionalProperties: false, required: ["item", "pitch"], properties: { item: { type: "string" }, pitch: { type: "string" } } }),
    quick: { type: "array", items: { type: "string" } },
  },
} as const;

const HEARTS = /[❤🧡💚💙💜🤍🤎💗💖💕💓💞💘]\uFE0F?/gu;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Svaret som klubben får: bara varor ur shoppen, och korta texter även när modellen skriver för långt. */
export function cleanReply(raw: AgentReply, shop: ShopPick[]): AgentReply {
  const known = (id: string | null) => (id && shop.some((s) => s.id === id) ? id : null);
  const post = raw.post && {
    ...raw.post,
    kicker: clip(raw.post.kicker.toUpperCase(), 18),
    title: clip(raw.post.title, 34),
    detail: clip(raw.post.detail, 56),
    score: raw.post.format === "resultat" ? raw.post.score : null,
    caption: clip(raw.post.caption.replace(HEARTS, "💛"), 600),
    hashtags: raw.post.hashtags.map((h) => h.replace(/^#/, "").replace(/\s+/g, "").toLowerCase()).filter(Boolean).slice(0, 6),
    product: known(raw.post.product),
  };
  const valid = post && !(post.format === "shop" && !post.product) && !(post.format === "resultat" && !post.score);
  const tipped = known(raw.merch?.item ?? null);
  const item = valid && post.product === tipped ? null : tipped;
  return {
    reply: clip(raw.reply.replace(HEARTS, "💛"), 400),
    post: valid ? post : null,
    merch: item && raw.merch ? { item, pitch: clip(raw.merch.pitch, 200) } : null,
    quick: raw.quick.map((q) => clip(q, 40)).slice(0, 3),
  };
}
