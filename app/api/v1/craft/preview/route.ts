import { z } from "zod";
import { variantLabel } from "@/components/poc/craft/variants";
import { clubProductDrafts, ColorChoices, type GarmentSpec, readSpec, VariantChoices } from "@/lib/poc/build";
import { getDesign } from "@/lib/poc/store";
import type { Design } from "@/lib/poc/types";

const Body = z.object({
  /** En sparad design, eller en ordmall som ännu inte sparats som design. */
  designId: z.string().max(40).optional(),
  template: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  clubIds: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).min(1).max(48),
  skus: z.array(z.string().max(40)).min(1).max(20),
  colors: ColorChoices.optional(),
  /** Ordmallens texter per klubb; varje variant blir en egen produkt (se VariantChoices i lib/poc/build.ts). */
  variants: VariantChoices.optional(),
});

/**
 * Förhandsvisningen innan Craft publicerar: samma titlar, priser, plaggfärger och mockuper som publiceringen ger, för
 * några av klubbarna. Inget sparas. `color` är plaggets färg och hur den valdes, `note` varför halsduken inte bär
 * designen, `variant` och `label` variantens nyckel och texter ("AIK · Solna").
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.designId && !parsed.data.template)) return Response.json({ error: "Välj en design, produkter och klubbar." }, { status: 400 });
  const { designId, template, clubIds, skus, colors, variants } = parsed.data;
  const design: Design | null = designId
    ? await getDesign(designId).catch(() => null)
    : { id: "forhandsvisning", name: "Förhandsvisning", source: { type: "ordmall", template: template! }, createdAt: new Date(0).toISOString() };
  if (!design) return Response.json({ error: "Designen finns inte." }, { status: 404 });
  const drafts = await clubProductDrafts(design, clubIds, skus, { colors, variants });
  return Response.json({
    items: drafts.map((d) => {
      const spec = readSpec(d.spec);
      const variant = spec?.kind === "halsduk" ? spec.variant : spec?.design.type === "ordmall" ? spec.design.variant : undefined;
      return {
        clubId: d.clubId,
        sku: d.sku,
        kind: d.kind,
        title: d.title,
        priceSek: d.priceSek,
        mockupUrl: d.mockupUrl,
        variant: d.variant ?? "",
        label: variant ? variantLabel(variant) : "",
        ...(spec?.kind === "plagg" && (spec as GarmentSpec).color ? { color: (spec as GarmentSpec).color } : {}),
        ...(spec?.kind === "halsduk" && spec.note ? { note: spec.note } : {}),
      };
    }),
  });
}
