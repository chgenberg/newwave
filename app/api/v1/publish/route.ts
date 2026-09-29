import { z } from "zod";
import { productById } from "@/lib/catalog";
import { CLUBS } from "@/lib/club";
import { MOCK_API_KEY } from "@/lib/intersport";
import { ConceptSchema, fileUrl } from "@/lib/schemas";

export const maxDuration = 60;

const PHOTO_GARMENT = "tee-white";

const ReviewSchema = z.object({ verdict: z.enum(["publicera", "underkänd"]), sales: z.number(), realism: z.number(), brandFit: z.number() });

const Body = z.object({
  clubId: z.string(),
  dropId: z.string(),
  concept: ConceptSchema,
  description: z.string(),
  printFiles: z.object({ light: fileUrl, dark: fileUrl }),
  photos: z.array(z.object({ url: fileUrl, label: z.string(), review: ReviewSchema.nullable() })),
  mockups: z.record(z.string(), fileUrl),
});

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, dropId, concept, description, printFiles, photos, mockups } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  const approved = photos.filter((p) => p.review?.verdict === "publicera");
  if (approved.length === 0) {
    return Response.json({ published: 0, reason: "Inga foton nådde granskarens gräns – inget publicerades." });
  }

  const origin = new URL(req.url).origin;
  const products = concept.products
    .map(productById)
    .filter((p) => p !== undefined && p.kind !== "mug" && mockups[p.id])
    .slice(0, club.agent.autopilot.maxProductsPerRun)
    .map((p) => ({
      sku: `CRAFT-POD-${p!.id.toUpperCase()}-${slug(concept.title).toUpperCase()}`,
      title: `${club.name} – ${concept.slogan} – ${p!.name.split(",")[0]} ${p!.garmentColor.toLowerCase()}`,
      description,
      priceSek: p!.priceSek,
      sizes: p!.sizes,
      images: [
        ...(p!.id === PHOTO_GARMENT
          ? approved.map((ph) => ({ url: `${origin}${ph.url}`, alt: `${concept.slogan} – ${ph.label}`, kind: "foto" as const }))
          : []),
        { url: `${origin}${mockups[p!.id]}`, alt: `${p!.name} ${p!.garmentColor}`, kind: "mockup" as const },
      ],
      printFileUrl: `${origin}${p!.dark ? printFiles.dark : printFiles.light}`,
      fulfilment: "print-on-demand" as const,
      dropId,
      signal: concept.signal,
      tags: [club.shortName, ...club.nicknames, concept.signal, concept.mode === "satir" ? "Satir" : "Klubbmerch"],
    }));

  const res = await fetch(`${origin}/api/mock-intersport/v1/club-shops/${club.id}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MOCK_API_KEY}` },
    body: JSON.stringify({ products }),
  });
  const json = await res.json();
  if (!res.ok) return Response.json({ error: `Intersport svarade ${res.status}`, details: json }, { status: 502 });
  return Response.json({ published: json.created.length, created: json.created, shopUrl: `/intersport/${club.id}` });
}
