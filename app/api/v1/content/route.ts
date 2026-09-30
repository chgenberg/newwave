import { z } from "zod";
import { createContentPack, demoContentPack } from "@/lib/agents";
import { productById } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { publicOrigin } from "@/lib/origin";
import { trackedLinks } from "@/lib/links";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { personalizationRules } from "@/lib/personalize";
import { checkConcept, passesAll } from "@/lib/rules";
import { ConceptSchema, SignalSchema, fileUrl } from "@/lib/schemas";
import { saveFile } from "@/lib/store";
import type { Signal } from "@/lib/types";

export const maxDuration = 180;

const Body = z.object({
  clubId: z.string(),
  signals: z.array(SignalSchema),
  items: z
    .array(z.object({ concept: ConceptSchema, printFiles: z.object({ light: fileUrl, dark: fileUrl, vector: fileUrl }) }))
    .min(1)
    .max(6),
  printPixels: z.object({ width: z.number(), height: z.number() }),
});

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, signals, items, printPixels } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  if (items.some((i) => !passesAll(checkConcept(club, i.concept)))) {
    return Response.json({ error: "Ett motiv bryter mot klubbens regelbok" }, { status: 422 });
  }
  const brand = club.kind === "brand";

  const origin = publicOrigin(req);
  const today = new Date().toISOString().slice(0, 10);
  const mode = hasOpenAIKey() ? "ai" : "demo";

  try {
    const results = await Promise.all(
      items.map(async ({ concept, printFiles }) => {
        const products = concept.products.map(productById).filter((p) => p !== undefined);
        const dropId = `${slug(club.shortName)}-${today}-${slug(concept.title)}`;
        const shopUrl = `${club.intersportShopUrl}?drop=${dropId}`;
        const links = trackedLinks(shopUrl, dropId, club.id);
        const signal = signals.find((s) => s.title === concept.signal) as Signal | undefined;

        const draft =
          mode === "ai"
            ? await createContentPack(club, concept, signal, products, links.instagram, today)
            : demoContentPack(club, concept, links.instagram, today);
        const swap = (text: string, channel: keyof typeof links) => text.split(links.instagram).join(links[channel]);
        const content = {
          ...draft,
          facebook: { post: swap(draft.facebook.post, "facebook") },
          linkedin: { post: swap(draft.linkedin.post, "linkedin") },
          tiktok: { ...draft.tiktok, caption: swap(draft.tiktok.caption, "tiktok") },
          newsletter: { ...draft.newsletter, body: swap(draft.newsletter.body, "nyhetsbrev") },
        };

        const intersportProducts = products.map((p) => ({
          sku: `${brand ? "CK" : "CRAFT"}-POD-${p.id.toUpperCase()}-${slug(concept.title).toUpperCase()}`,
          title: `${club.name} – ${concept.slogan} – ${p.name.split(",")[0]} ${p.garmentColor.toLowerCase()}`,
          description: `${concept.story} Trycks på beställning för ${club.name}. ${brand ? "Hämtas på din station eller skickas hem." : "Varje köp stöttar klubben."}`,
          priceSek: p.priceSek,
          priceNote: "Exempelpris i mockup",
          sizes: p.sizes,
          fulfilment: "print-on-demand",
          print: {
            method: p.printArea.method,
            areaCm: { width: p.printArea.widthCm, height: p.printArea.heightCm },
            fileUrl: `${origin}${p.dark ? printFiles.dark : printFiles.light}`,
            vectorUrl: `${origin}${printFiles.vector}`,
            pixels: printPixels,
            dpi: Math.round(printPixels.width / (30 / 2.54)),
            [brand ? "logo" : "crest"]: { source: "licensbibliotek", assetId: `${club.id}/${brand ? "logo" : "crest"}/official`, colors: club.crestColors },
          },
          personalization: p.kind === "mug" || brand ? { enabled: false } : personalizationRules(club, concept.signal),
          ...(brand ? { channel: "webbshop + stationer" } : { clubCommission: "enligt klubbavtal" }),
        }));

        return {
          conceptId: concept.id,
          dropId,
          shopUrl,
          links,
          content,
          intersport: {
            endpoint: brand ? "POST /v1/merch/shops/{shopId}/products" : "POST /v1/club-shops/{clubShopId}/products",
            ...(brand ? { shopId: club.id } : { clubShopId: club.id }),
            dropId,
            supplier: brand ? "Circle K Sverige AB · tryck på beställning" : "Craft of Scandinavia AB",
            tracking: { utmCampaign: dropId, channels: Object.keys(links) },
            products: intersportProducts,
          },
        };
      }),
    );

    await saveFile(JSON.stringify({ club: club.id, mode, createdAt: new Date().toISOString(), results }, null, 2), "json");
    return Response.json({ mode, results });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
