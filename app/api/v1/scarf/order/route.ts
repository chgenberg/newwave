import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { SCARF_ORDER, scarfUnitPrice } from "@/lib/scarf";
import { saveFile } from "@/lib/store";

const DIR = path.join(process.cwd(), ".data", "scarf", "orders");

const limiter = createLimiter(() => ({
  perKey: envInt("SCARF_ORDER_PER_IP_HOUR", 30),
  global: envInt("SCARF_ORDER_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));
const MAX_STORED = () => envInt("SCARF_ORDER_MAX_STORED", 5000);

const Body = z.object({
  club: z.string().trim().min(1).max(80),
  qty: z.number().int().min(SCARF_ORDER.minQty).max(SCARF_ORDER.maxQty),
  front: z.string().max(120).default(""),
  back: z.string().max(120).default(""),
  palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(2).max(7),
  previewDataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(4_000_000),
  contact: z.object({
    name: z.string().max(80).default(""),
    email: z.email().max(120),
    company: z.string().max(80).default(""),
  }),
});

export async function POST(req: Request) {
  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) {
    return Response.json({ error: "Du har skickat många förfrågningar på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });
  }
  const body = await readJson(req, 4_200_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Kontrollera antal och e-post." }, { status: 400 });

  await mkdir(DIR, { recursive: true });
  const files = await readdir(DIR);
  if (files.length >= MAX_STORED()) return Response.json({ error: "Vi kan inte ta emot fler förfrågningar just nu." }, { status: 503 });

  const d = parsed.data;
  const unitSek = scarfUnitPrice(d.qty);
  const now = new Date();
  const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }).replace(/-/g, "");
  const prefix = `HD-${day.slice(0, 4)}-${day.slice(4)}-`;
  const today = files.filter((f) => f.startsWith(prefix)).length;
  const record = {
    createdAt: now.toISOString(),
    club: cleanText(d.club, 80),
    qty: d.qty,
    unitSek,
    totalSek: unitSek * d.qty,
    leadTime: SCARF_ORDER.leadTime,
    front: cleanText(d.front, 120),
    back: cleanText(d.back, 120),
    palette: d.palette.map((h) => h.toUpperCase()),
    contact: { name: cleanText(d.contact.name, 80), email: d.contact.email.toLowerCase(), company: cleanText(d.contact.company, 80) },
  };
  for (let n = today + 1; n < today + 200; n++) {
    const reference = `${prefix}${String(n).padStart(3, "0")}`;
    const file = path.join(DIR, `${reference}.json`);
    try {
      await writeFile(file, JSON.stringify({ reference, ...record }, null, 2), { flag: "wx" });
    } catch {
      continue;
    }
    const preview = await saveFile(Buffer.from(d.previewDataUrl.split(",")[1] ?? "", "base64"), "png").catch(() => null);
    if (preview) await writeFile(file, JSON.stringify({ reference, ...record, preview: preview.url }, null, 2)).catch(() => {});
    console.log("scarf/order", reference, record.club, record.qty, record.contact.email);
    return Response.json({ reference, unitSek, totalSek: record.totalSek, leadTime: record.leadTime });
  }
  return Response.json({ error: "Kunde inte spara förfrågan" }, { status: 500 });
}
