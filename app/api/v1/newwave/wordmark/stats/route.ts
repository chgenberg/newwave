import { z } from "zod";
import { templateStats, track } from "@/lib/newwave/wordmark/stats";
import { findTemplate } from "@/lib/newwave/wordmark/store";

export async function GET() {
  return Response.json({ stats: await templateStats() });
}

const Body = z.object({ template: z.string().regex(/^[a-z0-9-]{2,40}$/) });

/** Ett val i designstudion. Beställningar räknas på servern när klubben godkänner. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await findTemplate(parsed.data.template))) return Response.json({ error: "Okänd mall." }, { status: 400 });
  await track(parsed.data.template, "picks");
  return new Response(null, { status: 204 });
}
