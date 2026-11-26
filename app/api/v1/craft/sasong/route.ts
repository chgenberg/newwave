import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { ContentError } from "@/lib/poc/content";
import { createPlan, listPlans, seasonRows } from "@/lib/poc/seasons";

const ID = z.string().regex(/^[a-z0-9-]{1,80}$/);

const Body = z.object({
  /** Säsongens id, t.ex. "regnperiod-2027". */
  season: z.string().max(60).optional(),
  designId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Designen som replikerades från förra säsongen. */
  sourceDesignId: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  clubIds: z.array(ID).min(1).max(6000),
  skus: z.array(z.string().max(40)).min(1).max(20),
  /** När planen ska publiceras (ISO-datum eller tidpunkt). */
  runAt: z.string().min(10).max(40),
  content: z.boolean().default(true),
  /** Redan publicerad via klubbkollektionens route: sparas med resultatet så att den syns bland planerna. */
  done: z.object({ published: z.number().int().min(0), clubs: z.number().int().min(0), drafts: z.number().int().min(0) }).optional(),
});

/** Säsongerna med förslag, och planerna. Kräver Crafts inloggning. */
export async function GET(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  try {
    const [seasons, plans] = await Promise.all([seasonRows(), listPlans()]);
    return Response.json({ seasons, plans });
  } catch (e) {
    console.error("craft/sasong", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte läsa säsongerna." }, { status: 500 });
  }
}

/** Sparar en plan: designen, klubbarna, produkterna och dagen den ska publiceras. Kräver Crafts inloggning. */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att planera." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Planen behöver en design, klubbar, produkter och ett datum." }, { status: 400 });
  try {
    return Response.json({ plan: await createPlan(parsed.data) });
  } catch (e) {
    if (e instanceof ContentError) return Response.json({ error: e.message }, { status: e.status });
    console.error("craft/sasong", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte spara planen." }, { status: 500 });
  }
}
