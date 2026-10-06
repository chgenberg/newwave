import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ALL_PRODUCTS, EVENTS, MAX_QTY, lineTotal, sumSek } from "@/lib/demoCatalog";
import { SITE, cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";

const DIR = path.join(process.cwd(), ".data", "demo", "quotes");
const BOOTH_URL = /^(\/api\/v1\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg|\/demo\/booth-placeholder\.jpg)$/;

const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_QUOTE_PER_IP_HOUR", 10),
  global: envInt("DEMO_QUOTE_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));
const MAX_STORED = () => envInt("DEMO_QUOTE_MAX_STORED", 5000);

const Body = z.object({
  brand: z.object({ name: z.string().max(80), site: z.union([z.literal(""), z.string().toLowerCase().max(120).regex(SITE)]) }),
  event: z.enum(EVENTS.map((e) => e.label) as [string, ...string[]]),
  boothUrl: z.string().max(120).regex(BOOTH_URL).optional(),
  totalSek: z.number().nonnegative().max(1e10).optional(),
  lines: z
    .array(
      z.object({
        id: z.string().max(40),
        model: z.string().max(40).optional(),
        name: z.string().max(80).optional(),
        spec: z.string().max(120).optional(),
        qty: z.number().int().min(1).max(MAX_QTY),
        unitSek: z.number().nonnegative().max(1e6).optional(),
      }),
    )
    .min(1)
    .max(ALL_PRODUCTS.length),
});

export async function POST(req: Request) {
  const body = await readJson(req, 16_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

  const seen = new Set<string>();
  const lines = [];
  for (const l of parsed.data.lines) {
    const p = ALL_PRODUCTS.find((x) => x.id === l.id);
    const m = p && (l.model ? p.models.find((x) => x.id === l.model) : p.models[0]);
    if (!p || !m || seen.has(p.id)) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
    seen.add(p.id);
    lines.push({ id: p.id, model: m.id, name: p.name, spec: m.id === p.models[0].id ? p.spec : m.name, qty: l.qty, unitSek: m.priceSek, totalSek: lineTotal(l.qty, m.priceSek) });
  }

  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) {
    return Response.json({ error: "Du har skickat många förfrågningar på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });
  }

  await mkdir(DIR, { recursive: true });
  const files = await readdir(DIR);
  if (files.length >= MAX_STORED()) return Response.json({ error: "Vi kan inte ta emot fler förfrågningar just nu. Kontakta oss direkt." }, { status: 503 });

  const now = new Date();
  const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }).replace(/-/g, "");
  const prefix = `MF-${day.slice(0, 4)}-${day.slice(4)}-`;
  const today = files.filter((f) => f.startsWith(prefix)).length;
  const record = {
    createdAt: now.toISOString(),
    brand: { name: cleanText(parsed.data.brand.name, 80) || "Okänt varumärke", site: parsed.data.brand.site },
    event: parsed.data.event,
    boothUrl: parsed.data.boothUrl,
    totalSek: sumSek(lines.map((l) => l.totalSek)),
    lines,
  };
  for (let n = today + 1; n < today + 20; n++) {
    const reference = `${prefix}${String(n).padStart(3, "0")}`;
    try {
      await writeFile(path.join(DIR, `${reference}.json`), JSON.stringify({ reference, ...record }, null, 2), { flag: "wx" });
      return Response.json({ reference, createdAt: record.createdAt, totalSek: record.totalSek });
    } catch {}
  }
  return Response.json({ error: "Kunde inte spara förfrågan" }, { status: 500 });
}
