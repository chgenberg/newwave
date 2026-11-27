import { z } from "zod";
import { loginDemo, roleFromRequest } from "@/lib/poc/auth";
import { shopOrigin } from "@/lib/poc/content";
import { advanceDemo, demoStatus, orderDemo, publishDemo } from "@/lib/poc/demo";

export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  /** Loggar in Craft, tryckeriet och stickeriet på en gång: med Crafts lösenord, eller som redan inloggad Craft. */
  z.object({ action: z.literal("start"), password: z.string().max(200).optional() }),
  z.object({ action: z.literal("publicera") }),
  z.object({ action: z.literal("order") }),
  z.object({ action: z.literal("producent"), orderId: z.string().min(1).max(60), producer: z.enum(["tryckeri", "stickeri"]) }),
  z.object({ action: z.literal("status"), orderId: z.string().min(1).max(60) }),
]);

/** Den guidade demons steg (lib/poc/demo.ts). Allt utom "start" kräver Crafts inloggning. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Okänt steg." }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.action === "start") {
      return (await loginDemo(b.password ?? null)) ? Response.json({ ok: true }) : Response.json({ error: "Fel lösenord." }, { status: 401 });
    }
    if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Starta demon igen – inloggningen har gått ut." }, { status: 401 });
    if (b.action === "publicera") return Response.json(await publishDemo(shopOrigin(req)));
    if (b.action === "order") return Response.json(await orderDemo());
    if (b.action === "producent") return Response.json(await advanceDemo(b.orderId, b.producer));
    const s = await demoStatus(b.orderId);
    return s ? Response.json(s) : Response.json({ error: "Ordern finns inte." }, { status: 404 });
  } catch (e) {
    console.error("poc/demo", b.action, e instanceof Error ? e.message : e);
    return Response.json({ error: e instanceof Error ? e.message : "Steget gick inte att göra." }, { status: 500 });
  }
}
