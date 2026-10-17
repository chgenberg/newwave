import { z } from "zod";
import { ART_URL, type Design } from "@/lib/newwave/marking";
import { priceLine, SHOP_CATALOG, type QuoteStatus } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, createQuote, event, getResellerBySlug, updateShop } from "@/lib/newwave/shopState";
import { fileUrl } from "@/lib/schemas";

const asset = z.string().regex(ART_URL);
const text = (max: number) => z.string().trim().max(max);

/** Designstudions resultat; designen tvättas och prissätts på servern. */
const Studio = {
  design: z.custom<Design>((v) => typeof v === "object" && v !== null && !Array.isArray(v)),
  color: z.string().max(9),
  preview: fileUrl.optional(),
  proofs: z.array(z.object({ label: text(80), image: fileUrl })).max(5).optional(),
};

const Line = z.object({
  productId: z.enum(SHOP_CATALOG.map((p) => p.id) as [string, ...string[]]),
  sizes: z.record(z.string().max(12), z.number().int().min(0).max(9999)),
  ...Studio,
  logo: asset,
  logoDark: asset.optional(),
  note: text(300).optional(),
});

const Create = z.object({
  slug: z.string().max(60),
  company: z.object({ name: text(80).min(2), contact: text(80).min(2), email: z.email().max(120), phone: text(40).optional() }),
  needBy: z.iso.date().optional(),
  message: text(1000).optional(),
  lines: z.array(Line).min(1).max(20),
});

const Patch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), id: z.string().max(20), reply: text(1000) }),
  z.object({ action: z.literal("accept"), token: z.string().max(40) }),
  z.object({ action: z.literal("decline"), token: z.string().max(40), reason: text(500).optional() }),
  z.object({ action: z.literal("produce"), id: z.string().max(20) }),
  z.object({ action: z.literal("deliver"), id: z.string().max(20) }),
  z.object({ action: z.literal("design"), id: z.string().max(20), index: z.number().int().min(0).max(19), ...Studio }),
]);

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Fyll i företag, kontaktperson, e-post och minst en produkt med antal." }, { status: 400 });
  const { slug, ...input } = parsed.data;
  const r = await getResellerBySlug(slug);
  if (!r || r.status !== "publicerad") return Response.json({ error: "Butiken finns inte" }, { status: 404 });
  const lines = input.lines.filter((l) => r.products.includes(l.productId));
  const quote = await createQuote(r.id, { ...input, lines });
  if (!quote) return Response.json({ error: "Välj storlekar och antal för minst en produkt." }, { status: 400 });
  return Response.json({ id: quote.id, token: quote.token });
}

/** Vem som får flytta en offert till nästa steg, och från vilket läge. */
const MOVES: Record<Exclude<z.infer<typeof Patch>["action"], "design">, { from: QuoteStatus[]; to: QuoteStatus }> = {
  send: { from: ["ny", "skickad"], to: "skickad" },
  accept: { from: ["skickad"], to: "godkänd" },
  decline: { from: ["skickad"], to: "nekad" },
  produce: { from: ["godkänd"], to: "produktion" },
  deliver: { from: ["produktion"], to: "levererad" },
};

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const d = parsed.data;

  if (d.action === "design") {
    const result = await updateShop((s) => {
      const q = s.quotes.find((x) => x.id === d.id && x.resellerId === CURRENT_RESELLER);
      const line = q?.lines[d.index];
      if (!q || !line) return { error: "Offerten finns inte", status: 404 } as const;
      if (q.status !== "ny" && q.status !== "skickad") return { error: "Offerten har redan godkänts", status: 409 } as const;
      const reseller = s.resellers.find((r) => r.id === q.resellerId)!;
      const priced = priceLine({ ...line, design: d.design, color: d.color, preview: d.preview, proofs: d.proofs }, reseller.markup);
      if (!priced) return { error: "Okänd produkt", status: 400 } as const;
      q.lines[d.index] = priced;
      q.totalSek = q.lines.reduce((sum, l) => sum + l.total, 0);
      q.costSek = q.lines.reduce((sum, l) => sum + l.cost, 0);
      q.events.push(event(reseller.name, `Justerade designen på ${priced.name.toLowerCase()} i designstudion.`));
      return { quote: q };
    });
    if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  }

  const move = MOVES[d.action];

  const result = await updateShop((s) => {
    const q = "token" in d ? s.quotes.find((x) => x.token === d.token) : s.quotes.find((x) => x.id === d.id && (d.action !== "send" || x.resellerId === CURRENT_RESELLER));
    if (!q) return { error: "Offerten finns inte", status: 404 } as const;
    if (!move.from.includes(q.status)) return { error: "Offerten har redan gått vidare", status: 409 } as const;
    const reseller = s.resellers.find((r) => r.id === q.resellerId)!;
    q.status = move.to;
    if (d.action === "send") {
      q.reply = d.reply;
      q.validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      q.events.push(event(reseller.name, "Skickade offerten till kunden."));
    }
    if (d.action === "accept") q.events.push(event(q.company.contact, "Godkände offerten. Ordern gick till New Wave."));
    if (d.action === "decline") q.events.push(event(q.company.contact, d.reason ? `Tackade nej: ${d.reason}` : "Tackade nej till offerten."));
    if (d.action === "produce") q.events.push(event("New Wave", "Tryckfilerna är klara och ordern ligger i produktion."));
    if (d.action === "deliver") q.events.push(event("New Wave", "Levererad till kunden."));
    return { quote: q };
  });
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
