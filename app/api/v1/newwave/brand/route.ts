import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { scrapeSite } from "@/lib/demoSite";
import { RULE_SCOPES, addFeed, readBrand, withBrand, writeBrand } from "@/lib/newwave/store";
import { errorMessage, generateJson, hasOpenAIKey } from "@/lib/openai";

export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan"), clubId: z.string() }),
  z.object({ action: z.literal("approve"), clubId: z.string(), tone: z.string().trim().min(10).max(600) }),
  z.object({
    action: z.literal("colors"),
    clubId: z.string(),
    palette: z
      .array(z.object({ name: z.string().trim().min(1).max(40), hex: z.string().regex(/^#[0-9A-F]{6}$/) }))
      .min(2)
      .max(6)
      .nullable(),
  }),
  z.object({ action: z.literal("interpret"), clubId: z.string(), text: z.string().trim().min(3).max(600) }),
  z.object({
    action: z.literal("rules"),
    clubId: z.string(),
    rules: z
      .array(
        z.object({
          id: z.string().max(40),
          text: z.string().trim().min(3).max(300),
          scope: z.enum(RULE_SCOPES),
          original: z.string().max(600),
          addedAt: z.string().max(40),
        }),
      )
      .max(30),
  }),
]);

type Interpreted = { rules: { text: string; scope: (typeof RULE_SCOPES)[number] }[]; conflict: string };

const interpretSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rules", "conflict"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "scope"],
        properties: { text: { type: "string" }, scope: { type: "string", enum: [...RULE_SCOPES] } },
      },
    },
    conflict: { type: "string" },
  },
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["tone", "tagline", "keywords", "rules", "summary"],
  properties: {
    tone: { type: "string" },
    tagline: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    rules: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

type Scan = { tone: string; tagline: string; keywords: string[]; rules: string[]; summary: string };

export async function GET(req: Request) {
  const clubId = new URL(req.url).searchParams.get("clubId") ?? "";
  if (!CLUBS[clubId]) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  return Response.json(await readBrand(clubId));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  if (parsed.data.action === "colors") {
    const { palette } = parsed.data;
    const brand = await writeBrand(club.id, { palette: palette ?? undefined });
    await addFeed(club.id, "Kansliet", palette ? `Ändrade klubbens färger till ${palette.map((c) => `${c.name} ${c.hex}`).join(", ")}.` : "Återställde klubbens färger.");
    return Response.json(brand);
  }

  if (parsed.data.action === "rules") {
    const before = (await readBrand(club.id)).ownRules ?? [];
    const { rules } = parsed.data;
    const brand = await writeBrand(club.id, { ownRules: rules });
    const added = rules.filter((r) => !before.some((b) => b.id === r.id));
    const removed = before.filter((b) => !rules.some((r) => r.id === b.id));
    if (added.length) await addFeed(club.id, "Kansliet", `La till ${added.length === 1 ? "en regel" : `${added.length} regler`} i regelboken: ${added.map((r) => `"${r.text}"`).join(", ")}`);
    if (removed.length) await addFeed(club.id, "Kansliet", `Tog bort ${removed.length === 1 ? "en regel" : `${removed.length} regler`} ur regelboken.`);
    return Response.json(brand);
  }

  if (parsed.data.action === "interpret") {
    const { text } = parsed.data;
    if (!hasOpenAIKey()) return Response.json({ mode: "demo", rules: [{ text, scope: "allt" }], conflict: "" });
    try {
      const current = await withBrand(club);
      const out = await generateJson<Interpreted>({
        system: `Du är regelagenten i Next Wave-hubben. Kansliet i ${club.name} skriver en regel med egna ord. Gör om den till 1–3 korta, tydliga regler som design-, text- och bildagenterna och granskaren kan följa och kontrollera.
- Skriv på svenska, i imperativ eller som ett förbud ("Skriv alltid …", "Använd aldrig …"). Max 25 ord per regel.
- Behåll kansliets mening exakt – lägg inte till krav de inte bett om. Dela bara upp om texten innehåller flera olika saker.
- scope: "motiv" för det som trycks och designen, "texter" för inlägg, nyhetsbrev och banner, "bilder" för foton och kampanjbilder, "allt" när det gäller allt.
- conflict: om en ny regel krockar med en befintlig regel, skriv kort vilken och varför. Annars tom sträng.`,
        user: `Kansliet skrev: "${text}"

Befintliga regler:
${current.rules.map((r) => `- ${r}`).join("\n")}`,
        schemaName: "club_rule",
        schema: interpretSchema,
      });
      return Response.json({ mode: "ai", rules: out.rules.slice(0, 3), conflict: out.conflict });
    } catch (err) {
      return Response.json({ error: errorMessage(err) }, { status: 502 });
    }
  }

  if (parsed.data.action === "approve") {
    const brand = await writeBrand(club.id, { tone: parsed.data.tone, toneApproved: true });
    await addFeed(club.id, "Kansliet", "Godkände klubbens tonalitet – alla agenter skriver nu med den.");
    return Response.json(brand);
  }

  if (!hasOpenAIKey()) return Response.json({ error: "AI är inte påslaget i den här miljön" }, { status: 503 });
  try {
    const site = new URL(club.sources.website).host;
    const page = await scrapeSite(site, { deadlineMs: 40_000 });
    const scan = await generateJson<Scan>({
      system: `Du är varumärkesagenten i Next Wave-hubben. Du läser av en idrottsförenings webbplats och beskriver hur föreningen låter, så att alla andra agenter (innehåll, design, nyhetsbrev, butik) kan skriva och formge i föreningens anda.
Skriv på svenska. Hitta inte på fakta som inte står på sidan.
- tone: 2–3 meningar om tonalitet och vem föreningen pratar med.
- tagline: en kort devis (max 8 ord) som känns äkta för föreningen.
- keywords: 5–8 ord eller uttryck som återkommer eller känns typiska (sektioner, platser, evenemang).
- rules: 3–5 konkreta skrivregler för agenterna (t.ex. vad man alltid nämner, vad man undviker).
- summary: en mening om vad du läste av.`,
      user: `Förening: ${club.name} (grundad ${club.founded}, ${club.city}).
Färger: ${club.palette.map((c) => `${c.name} ${c.hex}`).join(", ")}.

Webbplats ${page.url}
Titel: ${page.title}
Beskrivning: ${page.description}
Meny: ${page.nav.slice(0, 30).join(" · ")}
Rubriker: ${page.headings.slice(0, 30).join(" · ")}
Text:
${page.text.slice(0, 3500)}`,
      schemaName: "brand_scan",
      schema,
    });
    const brand = await writeBrand(club.id, { ...scan, scannedAt: new Date().toISOString(), toneApproved: false });
    await addFeed(club.id, "Varumärkesagenten", `Läste av ${site} och föreslog tonalitet och skrivregler för godkännande.`);
    return Response.json(brand);
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
