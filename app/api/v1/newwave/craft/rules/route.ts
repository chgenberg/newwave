import { z } from "zod";
import { nwProduct } from "@/lib/newwave/catalog";
import { DEFAULT_RULES, logItem, readCraftRules, updateState } from "@/lib/newwave/craftState";

const Body = z.object({
  rules: z.array(z.string().trim().min(4).max(240)).max(20),
  products: z.array(z.string()).min(1).max(60),
  minScore: z.number().int().min(5).max(10),
});

export async function GET() {
  return Response.json({ rules: await readCraftRules() });
}

export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  if (raw?.reset === true) {
    await updateState((s) => {
      delete s.rules;
      s.log.unshift(logItem({ kind: "regler", text: "Återställde Crafts regler till standard." }));
    });
    return Response.json({ rules: DEFAULT_RULES });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Varje regel behöver minst fyra tecken och minst en produkt måste vara tillåten." }, { status: 400 });
  const rules = { ...parsed.data, products: parsed.data.products.filter((id) => nwProduct(id)) };
  await updateState((s) => {
    s.rules = rules;
    s.log.unshift(logItem({ kind: "regler", text: `Uppdaterade reglerna: ${rules.rules.length} regler, ${rules.products.length} produkter, betyg från ${rules.minScore}.` }));
  });
  return Response.json({ rules });
}
