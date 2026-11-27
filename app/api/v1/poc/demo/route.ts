import { z } from "zod";
import { loginDemo, roleFromRequest } from "@/lib/poc/auth";
import { advanceDemo, DemoError, demoStatus, orderDemo, publishDemo } from "@/lib/poc/demo";
import { PocError } from "@/lib/poc/orders";

export const maxDuration = 120;

const ID = z.string().min(1).max(80);
const Body = z.discriminatedUnion("action", [
  /** Loggar in Craft, tryckeriet och stickeriet på en gång: med Crafts lösenord, eller som redan inloggad Craft. */
  z.object({ action: z.literal("start"), password: z.string().max(200).optional() }),
  /** En av demons ordmallar (`template`) eller en uppladdad design (`designId`), till de valda klubbarna. */
  z.object({ action: z.literal("publicera"), template: z.string().max(40).optional(), designId: ID.optional(), clubIds: z.array(ID).min(1).max(3) }),
  z.object({ action: z.literal("order"), clubId: ID, designId: ID }),
  z.object({ action: z.literal("producent"), orderId: ID, producer: z.enum(["tryckeri", "stickeri"]) }),
  z.object({ action: z.literal("status"), orderId: ID }),
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
    if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Inloggningen har gått ut – ladda om sidan och logga in igen." }, { status: 401 });
    if (b.action === "publicera") return Response.json(await publishDemo({ template: b.template, designId: b.designId }, b.clubIds));
    if (b.action === "order") return Response.json(await orderDemo(b.clubId, b.designId));
    if (b.action === "producent") return Response.json(await advanceDemo(b.orderId, b.producer));
    return Response.json(await demoStatus(b.orderId));
  } catch (e) {
    if (e instanceof DemoError || e instanceof PocError) return Response.json({ error: e.message }, { status: 400 });
    console.error("poc/demo", b.action, e instanceof Error ? e.message : e);
    return Response.json({ error: "Steget gick inte att göra just nu." }, { status: 500 });
  }
}
