import { z } from "zod";
import { clientIp, createLimiter, envInt, readJson } from "@/lib/demoLimit";
import { type Brandbook, MAX_COLORS, isHex } from "@/lib/newwave/brandKit";
import { TEXT_MODEL, errorMessage, hasOpenAIKey, openai } from "@/lib/openai";

export const maxDuration = 120;

const MAX_BYTES = 28_000_000;

const limiter = createLimiter(() => ({
  perKey: envInt("NW_BRANDBOOK_PER_IP_HOUR", 10),
  global: envInt("NW_BRANDBOOK_GLOBAL_HOUR", 200),
  windowMs: 60 * 60 * 1000,
}));

const Body = z.object({
  dataUrl: z.string().regex(/^data:application\/pdf[^,]*;base64,/).max(MAX_BYTES),
  name: z.string().max(120).optional(),
});

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "colors", "fonts", "tone", "rules"],
  properties: {
    name: { type: "string" },
    colors: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "hex"], properties: { name: { type: "string" }, hex: { type: "string" } } },
    },
    fonts: { type: "array", items: { type: "string" } },
    tone: { type: "string" },
    rules: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `Du läser grafiska profiler (brandbooks) åt en tryckeri- och profilklädesstudio.
Returnera:
- name: varumärkets namn.
- colors: 1–6 färger i profilens prioritetsordning, primärfärgen först. hex som #RRGGBB med versaler. Använd profilens egna färgnamn, annars ett kort svenskt namn.
- fonts: typsnitten som profilen anger, rubrik först. Tom lista om inga anges.
- tone: en mening på svenska om profilens känsla.
- rules: högst 6 korta regler på svenska som påverkar tryck på kläder och produkter, t.ex. frizon, minsta storlek, tillåtna bakgrunder, förbjudna varianter.
Hitta aldrig på något som inte står eller syns i dokumentet.`;

export async function POST(req: Request) {
  const body = await readJson(req, MAX_BYTES + 1_000);
  if (body === undefined) return Response.json({ error: "PDF:en är större än 20 MB." }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Ladda upp profilen som PDF (högst 20 MB)." }, { status: 400 });
  if (!hasOpenAIKey()) return Response.json({ error: "AI-läsning är inte aktiverad i den här miljön." }, { status: 503 });
  const verdict = limiter.take(clientIp(req));
  if (!verdict.ok) return Response.json({ error: "Många profiler på kort tid. Försök igen om en stund." }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });
  try {
    const res = await openai().responses.create({
      model: TEXT_MODEL,
      input: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "input_file", filename: parsed.data.name || "brandbook.pdf", file_data: parsed.data.dataUrl },
            { type: "input_text", text: "Läs den grafiska profilen." },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "brandbook", schema, strict: true } },
    });
    const out = JSON.parse(res.output_text) as Brandbook;
    const colors = out.colors.map((c) => ({ name: c.name.trim().slice(0, 40), hex: c.hex.trim().toUpperCase() })).filter((c) => isHex(c.hex));
    if (!colors.length) return Response.json({ error: "Hittade inga färger i profilen." }, { status: 422 });
    const book: Brandbook = {
      name: out.name.trim().slice(0, 80),
      colors: colors.slice(0, MAX_COLORS),
      fonts: out.fonts.map((f) => f.trim()).filter(Boolean).slice(0, 4),
      tone: out.tone.trim().slice(0, 300),
      rules: out.rules.map((r) => r.trim()).filter(Boolean).slice(0, 6),
    };
    return Response.json(book);
  } catch (e) {
    return Response.json({ error: `Kunde inte läsa profilen. ${errorMessage(e)}` }, { status: 502 });
  }
}
