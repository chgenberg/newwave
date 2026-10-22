import { z } from "zod";
import { featuredTemplates, featureTemplate, findTemplate, TemplateTaken } from "@/lib/newwave/wordmark/store";

const Body = z.object({ id: z.string().min(1).max(60), on: z.boolean() });

/** Designerna som är tilldelade alla klubbar – de visas först i varje klubbs shop, efter klubbens egna favoriter. */
export async function GET() {
  return Response.json({ ids: await featuredTemplates() });
}

export async function PUT(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ange designen." }, { status: 400 });
  const { id, on } = parsed.data;
  const template = await findTemplate(id);
  if (on && (!template || template.hidden)) return Response.json({ error: "Designen finns inte." }, { status: 404 });
  try {
    return Response.json({ ids: await featureTemplate(id, on) });
  } catch (e) {
    return Response.json({ error: e instanceof TemplateTaken ? e.message : "Kunde inte tilldela designen." }, { status: 409 });
  }
}
