import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { addProducts, customizeProduct, listProducts } from "@/lib/intersport";
import { nwProduct } from "@/lib/newwave/catalog";
import { colorName } from "@/lib/newwave/colors";
import { craftOverview } from "@/lib/newwave/craft";
import { updateState } from "@/lib/newwave/craftState";
import { ART_URL, type Customized, sanitizeColor, sanitizeDesign } from "@/lib/newwave/marking";
import { addFeed, customizeApproval } from "@/lib/newwave/store";
import { publicOrigin } from "@/lib/origin";
import { fileUrl } from "@/lib/schemas";

const id = z.string().min(1).max(80);

const Body = z.object({
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("approval"), clubId: id, approvalId: id }),
    z.object({ kind: z.literal("shop"), clubId: id, shopProductId: id }),
    z.object({ kind: z.literal("new-shop"), clubId: id }),
    z.object({ kind: z.literal("craft"), materialId: id }),
  ]),
  productId: id,
  art: z.string().regex(ART_URL).nullable().optional(),
  design: z.unknown(),
  color: z.string(),
  mockupUrl: fileUrl,
});

/** Sparar en design från designstudion där den öppnades: i ett godkännande, i klubbens butik eller i Crafts material. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { target, productId, art, mockupUrl } = parsed.data;
  const product = nwProduct(productId);
  const design = product && sanitizeDesign(product, parsed.data.design);
  if (!product || !design) return Response.json({ error: "Okänd produkt eller design" }, { status: 400 });
  const c: Customized = { design, color: sanitizeColor(product, parsed.data.color), mockupUrl };

  if (target.kind === "craft") {
    const m = (await craftOverview()).flatMap((r) => r.materials).find((x) => x.id === target.materialId);
    if (!m || !m.products.includes(productId)) return Response.json({ error: "Okänt material" }, { status: 404 });
    await updateState((s) => {
      s.designs = { ...s.designs, [m.id]: { ...s.designs?.[m.id], [productId]: c } };
    });
    return Response.json({ ok: true });
  }

  const club = CLUBS[target.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  if (target.kind === "approval") {
    const a = await customizeApproval(club.id, target.approvalId, productId, c);
    if (!a) return Response.json({ error: "Hittades inte" }, { status: 404 });
    // Redan godkänt material ligger i butiken – där ska den nya bilden också synas.
    if (a.status === "godkänd") {
      const skus = new Set((a.shopProducts ?? []).filter((sp) => sp.sku.startsWith(`CRAFT-POD-${productId.toUpperCase()}-`)).map((sp) => sp.sku));
      for (const sp of (await listProducts(club.id)).filter((x) => skus.has(x.sku))) await customizeProduct(club.id, sp.id, c);
    }
    await addFeed(club.id, "Kansliet", `Anpassade ${product.name.toLowerCase()} i "${a.title}" i designstudion.`);
    return Response.json({ ok: true });
  }

  if (target.kind === "shop") {
    const p = await customizeProduct(club.id, target.shopProductId, c);
    if (!p) return Response.json({ error: "Hittades inte" }, { status: 404 });
    await addFeed(club.id, "Kansliet", `Anpassade ${product.name.toLowerCase()} i butiken i designstudion.`);
    return Response.json({ ok: true });
  }

  const print = design.logo ?? art;
  if (!print) return Response.json({ error: "Tryckfil saknas" }, { status: 400 });
  const day = new Date().toISOString().slice(0, 10);
  const [added] = await addProducts(club.id, [
    {
      sku: `CRAFT-POD-${product.id.toUpperCase()}-EGEN-${Date.now().toString(36).toUpperCase()}`,
      title: `${club.name} – Egen design – ${product.name} ${colorName(c.color).toLowerCase()}`,
      description: `${product.name} med ${club.shortName}s tryck, gjord i designstudion.`,
      priceSek: product.priceSek,
      sizes: product.sizes,
      images: [{ url: mockupUrl, alt: `${product.name} med ${club.shortName}s tryck`, kind: "mockup" }],
      printFileUrl: `${publicOrigin(req)}${print}`,
      fulfilment: "print-on-demand",
      dropId: `egen-${day}`,
      signal: "Egen design",
      tags: [club.shortName, "Egen design", "Klubbmerch"],
      custom: { design: c.design, color: c.color },
    },
  ]);
  await addFeed(club.id, "Kansliet", `Lade ut ${product.name.toLowerCase()} med egen design i klubbens butik.`);
  return Response.json({ ok: true, id: added.id });
}
