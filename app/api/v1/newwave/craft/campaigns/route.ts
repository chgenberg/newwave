import { z } from "zod";
import { nwProduct } from "@/lib/newwave/catalog";
import { sanitizeColor, sanitizeDesign } from "@/lib/newwave/marking";
import { craftClub, deliverCampaign } from "@/lib/newwave/craft";
import { publicOrigin } from "@/lib/origin";
import { type Campaign, logItem, newId, readCraftRules, readState, today, updateState } from "@/lib/newwave/craftState";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Body = z.object({
  title: z.string().trim().min(2).max(80),
  occasion: z.string().trim().min(2).max(60),
  date: day.optional(),
  brief: z.string().trim().min(10).max(1200),
  products: z.array(z.string()).min(1).max(8),
  clubIds: z.array(z.string()).min(1).max(2000),
  sendAt: day.optional(),
  deadline: day.optional(),
  remind: z.boolean().optional(),
  sourceId: z.string().max(80).optional(),
  designs: z.record(z.string(), z.object({ design: z.unknown(), color: z.string().max(9) })).optional(),
});

export async function GET() {
  return Response.json({ campaigns: (await readState()).campaigns });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Fyll i titel, tillfälle, brief, minst en produkt och minst en klubb." }, { status: 400 });
  const input = parsed.data;
  const allowed = new Set((await readCraftRules()).products);
  const products = input.products.filter((id) => allowed.has(id));
  const clubIds = [...new Set(input.clubIds)].filter((id) => craftClub(id));
  if (!products.length || !clubIds.length) return Response.json({ error: "Produkterna eller klubbarna finns inte i Crafts sortiment." }, { status: 400 });
  if (input.deadline && input.deadline < (input.sendAt ?? today())) return Response.json({ error: "Sista dag att godkänna måste ligga efter utskicket." }, { status: 400 });

  const designs = Object.fromEntries(
    products.flatMap((id) => {
      const p = nwProduct(id);
      const d = input.designs?.[id];
      const design = p && d ? sanitizeDesign(p, d.design) : undefined;
      return p && d && design ? [[id, { design, color: sanitizeColor(p, d.color) }]] : [];
    }),
  );
  const later = input.sendAt && input.sendAt > today();
  const campaign: Campaign = { ...input, designs: Object.keys(designs).length ? designs : undefined, sendAt: later ? input.sendAt : undefined, products, clubIds, id: newId(), createdAt: today(), delivered: !later };
  if (!later) campaign.approvals = await deliverCampaign(campaign, publicOrigin(req));
  await updateState((s) => {
    s.campaigns.unshift(campaign);
    s.log.unshift(logItem({ kind: "kampanj", text: later ? `Schemalade "${campaign.title}" till ${clubIds.length} klubbar den ${campaign.sendAt}.` : `Skickade "${campaign.title}" till ${clubIds.length} klubbar.`, clubIds }));
  });
  return Response.json({ campaign });
}
