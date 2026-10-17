import { z } from "zod";
import { NW_CATALOG, seasonLabel } from "@/lib/newwave/catalog";
import { CLUBS } from "@/lib/club";
import { listProducts } from "@/lib/intersport";
import { clubOccasions } from "@/lib/newwave/club";
import { LEGS, PORTALS } from "@/lib/newwave/hub";
import { listApprovals, readBrand } from "@/lib/newwave/store";
import { TEXT_MODEL, errorMessage, hasOpenAIKey, openai } from "@/lib/openai";

export const maxDuration = 60;

const Body = z.object({
  clubId: z.string(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  if (!hasOpenAIKey()) return Response.json({ error: "AI är inte påslaget i den här miljön" }, { status: 503 });

  const now = new Date();
  const [approvals, products, brand] = await Promise.all([listApprovals(club.id), listProducts(club.id), readBrand(club.id)]);
  const pending = approvals.filter((a) => a.status === "väntar");
  const occasions = clubOccasions(now, 60);

  const system = `Du är Klubbsupporten i Next Wave-navet och hjälper ${club.name}s kansli, ledare och styrelse. Svara på svenska, kort och konkret (max ~120 ord), varmt och enkelt – många är ideella och inte tekniska. Skriv vanlig text: punktlistor med "- " går bra, men ingen annan formatering (inga rubriker eller tabeller).

Så fungerar navet:
- Allt material skapas isolerat i navet och skickas sedan via API till New Wave, som skickar vidare till tryck, leverantörer, frakt och ekonomi. Själva orderflödet ligger utanför navet.
- Benen i navet: ${LEGS.map((l) => `${l.title} (${l.description})`).join("; ")}.
- Portaler: ${PORTALS.map((p) => `${p.title} – ${p.who}`).join("; ")}.
- I klubbens dashboard finns flikarna Översikt, Material (skapa merch och inlägg med agenterna), Butik (klubbens butik hos Intersport), Varumärke (logga, färger, typsnitt, tonalitet) och Support (du).
- Flödet för merch: välj tillfälle under Material → agenten föreslår motiv → designagenten tar fram tryckfil i klubbens färger och granskar mot regelboken → mockups och inlägg skapas → kansliet godkänner under Översikt → produkterna läggs ut i butiken. Tryck sker på beställning, utan lager. Varje köp stöttar föreningen.

Klubben:
- ${club.name}, grundad ${club.founded} i ${club.city}. Sektioner: fotboll, pingis, innebandy. Webb: ${club.sources.website}.
- Tonalitet: ${brand.toneApproved && brand.tone ? brand.tone : club.tone}
- Regelbok: ${club.rules.join(" ")}
- Väntar på godkännande (${pending.length}): ${pending.map((a) => `"${a.title}" (${a.kind})`).join(", ") || "inget"}.
- Produkter i butiken: ${products.length}${products.length ? ` – ${products.slice(0, 5).map((p) => p.title).join("; ")}` : ""}.
- Sortiment att trycka på (${NW_CATALOG.length} produkter, agenten väljer efter säsong och aktivitet): ${NW_CATALOG.map((p) => `${p.name} ${p.priceSek} kr (${seasonLabel(p.seasons)})`).join("; ")}.
- Kommande tillfällen: ${occasions.slice(0, 6).map((o) => `${o.title} ${o.date ?? ""}`).join("; ")}.

Hitta inte på priser, leveranstider, avtal eller personer. Vet du inte, säg det och föreslå att kansliet kontaktar Next Wave Production. Om frågan gäller en beställning eller leverans: förklara att orderflödet sköts av New Wave och att du kan hjälpa till med material och butik.`;

  try {
    const res = await openai().responses.create({
      model: TEXT_MODEL,
      input: [{ role: "system", content: system }, ...parsed.data.messages],
    });
    return Response.json({ reply: res.output_text.trim() });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
