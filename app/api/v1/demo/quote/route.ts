import { randomBytes } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EVENTS } from "@/lib/demoEvents";
import { cleanText, clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { sendQuoteMail } from "@/lib/demoMail";
import { OfferFields, priceLines } from "@/lib/demoOffer";

export const maxDuration = 60;

const DIR = path.join(process.cwd(), ".data", "demo", "quotes");

const limiter = createLimiter(() => ({
  perKey: envInt("DEMO_QUOTE_PER_IP_HOUR", 10),
  global: envInt("DEMO_QUOTE_GLOBAL_HOUR", 300),
  windowMs: 60 * 60 * 1000,
}));
const MAX_STORED = () => envInt("DEMO_QUOTE_MAX_STORED", 5000);

const Body = z.object({
  ...OfferFields,
  totalSek: z.number().nonnegative().max(1e10).optional(),
  contact: z.object({
    name: z.string().max(80).default(""),
    email: z.email().max(120),
    company: z.string().max(80).default(""),
  }),
});

export async function POST(req: Request) {
  const body = await readJson(req, 16_000);
  if (body === undefined) return Response.json({ error: "Förfrågan är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const priced = priceLines(parsed.data.lines, parsed.data.event);
  if (!priced) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

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
    token: randomBytes(16).toString("base64url"),
    brand: { name: cleanText(parsed.data.brand.name, 80) || "Okänt varumärke", site: parsed.data.brand.site },
    event: EVENTS[parsed.data.event].label,
    eventId: parsed.data.event,
    eventDate: parsed.data.eventDate ?? "",
    visitors: parsed.data.visitors ?? "",
    package: parsed.data.package ?? "",
    boothUrl: parsed.data.boothUrl,
    format: parsed.data.format,
    contact: {
      name: cleanText(parsed.data.contact.name, 80),
      email: parsed.data.contact.email.toLowerCase(),
      company: cleanText(parsed.data.contact.company, 80),
    },
    ...priced,
  };
  for (let n = today + 1; n < today + 20; n++) {
    const reference = `${prefix}${String(n).padStart(3, "0")}`;
    const file = path.join(DIR, `${reference}.json`);
    try {
      await writeFile(file, JSON.stringify({ reference, ...record }, null, 2), { flag: "wx" });
    } catch {
      continue;
    }
    const mail = await sendQuoteMail({ reference, ...record });
    await writeFile(file, JSON.stringify({ reference, ...record, emailed: mail.sent }, null, 2)).catch(() => {});
    return Response.json({
      reference,
      createdAt: record.createdAt,
      totalSek: record.totalSek,
      emailed: mail.sent,
      pdf: `/api/v1/demo/quote/pdf?ref=${reference}&t=${record.token}`,
    });
  }
  return Response.json({ error: "Kunde inte spara förfrågan" }, { status: 500 });
}
