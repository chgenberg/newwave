import { z } from "zod";
import { catalogFor } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { nwProduct } from "@/lib/newwave/catalog";
import { sanitizeColor, sanitizeDesign } from "@/lib/newwave/marking";
import { addFeed, createApproval, listApprovals } from "@/lib/newwave/store";
import { publicOrigin } from "@/lib/origin";
import { ConceptSchema, fileUrl } from "@/lib/schemas";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const Body = z.object({
  clubId: z.string(),
  concept: ConceptSchema,
  previewUrl: fileUrl,
  printFiles: z.object({ light: fileUrl, dark: fileUrl }),
  mockups: z.record(z.string(), fileUrl),
  /** Produkter som anpassats i designstudion innan materialet skickades. */
  designs: z.record(z.string(), z.object({ design: z.unknown(), color: z.string() })).optional(),
  from: z.string().max(40).optional(),
  content: z.object({
    instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    facebook: z.object({ post: z.string() }),
    newsletter: z.object({ subject: z.string(), body: z.string() }),
    banner: z.object({ headline: z.string(), subline: z.string(), altText: z.string() }).optional(),
    tiktok: z.object({ hook: z.string(), script: z.array(z.string()), caption: z.string() }).optional(),
    plan: z.array(z.object({ date: z.string().max(20), channel: z.string().max(60), action: z.string().max(400) })).max(10).optional(),
  }),
  assets: z.object({ feed: fileUrl, story: fileUrl, banner: fileUrl, poster: fileUrl }).optional(),
  photos: z.array(z.object({ id: z.string().max(40), label: z.string().max(60), url: fileUrl })).max(4).optional(),
  shopUrl: z.string().url().optional(),
  weekly: z
    .object({
      week: z.number().int().min(1).max(53),
      signals: z.array(z.string().max(120)).max(8),
      candidates: z
        .array(z.object({ concept: ConceptSchema, brand: z.number().min(0).max(10), sales: z.number().min(0).max(10), note: z.string().max(400) }))
        .min(1)
        .max(6),
      picked: z.number().int().min(0),
    })
    .optional(),
});

export async function GET(req: Request) {
  const clubId = new URL(req.url).searchParams.get("clubId") ?? "";
  if (!CLUBS[clubId]) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  return Response.json({ approvals: await listApprovals(clubId) });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, concept, previewUrl, printFiles, mockups, designs, content, from, assets, photos, shopUrl, weekly } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const origin = publicOrigin(req);
  const dropId = `${slug(club.shortName)}-${new Date().toISOString().slice(0, 10)}-${slug(concept.title)}`;
  const catalog = concept.products.map((id) => catalogFor(clubId, true).find((p) => p.id === id)).filter((p) => p !== undefined && mockups[p.id]);
  const customOf = (id: string) => {
    const p = nwProduct(id);
    const d = designs?.[id];
    const design = p && d ? sanitizeDesign(p, d.design) : undefined;
    return p && d && design ? { design, color: sanitizeColor(p, d.color) } : undefined;
  };
  const products = catalog.map((p) => ({
    id: p!.id,
    name: `${p!.name.split(",")[0]} ${p!.garmentColor.toLowerCase()}`,
    priceSek: p!.priceSek,
    mockupUrl: mockups[p!.id],
    printUrl: p!.dark ? printFiles.dark : printFiles.light,
    custom: customOf(p!.id),
  }));
  const shopProducts = catalog
    .filter((p) => p!.kind !== "booth")
    .slice(0, club.agent.autopilot.maxProductsPerRun)
    .map((p) => ({
      sku: `CRAFT-POD-${p!.id.toUpperCase()}-${slug(concept.title).toUpperCase()}`,
      title: `${club.name} – ${concept.slogan} – ${p!.name.split(",")[0]} ${p!.garmentColor.toLowerCase()}`,
      description: concept.story,
      priceSek: p!.priceSek,
      sizes: p!.sizes,
      images: [{ url: mockups[p!.id], alt: `${concept.slogan} – ${p!.name} ${p!.garmentColor}`, kind: "mockup" as const }],
      printFileUrl: `${origin}${p!.dark ? printFiles.dark : printFiles.light}`,
      fulfilment: "print-on-demand" as const,
      dropId,
      signal: concept.signal,
      tags: [club.shortName, concept.signal, "Klubbmerch"],
    }));

  const approval = await createApproval(clubId, {
    kind: weekly ? "Veckans paket" : "Merch och inlägg",
    title: concept.slogan,
    occasion: concept.signal,
    slogan: concept.slogan,
    story: concept.story,
    previewUrl,
    content,
    assets,
    photos,
    printFiles,
    shopUrl,
    weekly,
    products,
    shopProducts,
    from,
  });
  await addFeed(
    clubId,
    club.agent.name,
    weekly
      ? `Vecka ${weekly.week}: valde "${concept.slogan}" av ${weekly.candidates.length} motiv och skickade veckans paket – foton, inlägg, banner och nyhetsbrev.`
      : `Skickade "${concept.slogan}" (${concept.signal}) för godkännande – tryckfil, ${products.length} mockups och inlägg.`,
  );
  return Response.json({ approval });
}
