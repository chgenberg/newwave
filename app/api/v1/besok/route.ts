import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE, isAdmin } from "@/lib/access";
import { clientIp, createLimiter, readJson } from "@/lib/demoLimit";
import { isVisitorId, logVisit, trackingOn, VISITOR_COOKIE } from "@/lib/visits";

const hits = createLimiter(() => ({ perKey: 120, global: 6000, windowMs: 60_000 }));
const text = (max: number) => z.string().max(max).optional();

const Body = z.object({
  type: z.enum(["view", "ping", "film"]),
  sid: z.string().regex(/^[a-z0-9]{12,32}$/),
  path: z.string().startsWith("/").max(300),
  sec: z.number().min(0).max(60).optional(),
  pct: z.number().int().min(0).max(100).optional(),
  ref: text(300),
  lang: text(40),
  screen: text(20),
  tz: text(60),
});

/** Sidvisningar, aktiv tid och filmen från webbläsaren. Öppen även före inloggningen, så att försök som aldrig kom in syns. */
export async function POST(req: Request) {
  const none = new NextResponse(null, { status: 204 });
  if (!trackingOn()) return none;
  const ip = clientIp(req);
  if (!hits.take(ip).ok) return none;

  const jar = await cookies();
  if (await isAdmin(jar.get(ADMIN_COOKIE)?.value)) return none;
  const body = Body.safeParse(await readJson(req, 2000));
  if (!body.success) return NextResponse.json({ error: "Ogiltig händelse." }, { status: 400 });

  const vid = jar.get(VISITOR_COOKIE)?.value;
  if (!isVisitorId(vid)) return none;
  await logVisit({ ...body.data, sec: body.data.sec && Math.round(body.data.sec), vid, ip, ua: (req.headers.get("user-agent") ?? "").slice(0, 300) });
  return none;
}
