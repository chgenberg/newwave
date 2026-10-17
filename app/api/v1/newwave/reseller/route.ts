import sharp from "sharp";
import { z } from "zod";
import { scrapeSite, type SiteScrape } from "@/lib/demoSite";
import { LogoError, logoFromUrl, type LogoResult } from "@/lib/logo";
import { loadFile } from "@/lib/store";
import { errorMessage, generateJson, hasOpenAIKey } from "@/lib/openai";
import { SHOP_CATALOG, type Reseller, type ShopTexts } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, blankReseller, getReseller, quotesFor, updateShop } from "@/lib/newwave/shopState";

export const maxDuration = 120;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const asset = z.string().regex(/^(\/api\/v1\/files\/[0-9a-f-]{36}\.(png|svg|jpg)|\/newwave\/resellers\/[a-z0-9-]+\/[a-z0-9-]+\.png)$/);
const text = (max: number) => z.string().trim().max(max);

const Patch = z
  .object({
    name: text(60).min(2),
    website: text(200),
    logo: asset,
    logoDark: asset,
    theme: z.object({ primary: hex, accent: hex, background: hex }),
    texts: z.object({ shopName: text(60).min(2), tagline: text(120), heroTitle: text(90), heroText: text(300), about: text(600), email: text(120), phone: text(40) }),
    products: z.array(z.enum(SHOP_CATALOG.map((p) => p.id) as [string, ...string[]])).max(SHOP_CATALOG.length),
    markup: z.number().min(-20).max(60),
  })
  .partial();

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), patch: Patch }),
  z.object({ action: z.literal("import"), website: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("unpublish") }),
  z.object({ action: z.literal("reset") }),
]);

export async function GET() {
  const reseller = await getReseller(CURRENT_RESELLER);
  if (!reseller) return Response.json({ error: "Okänd återförsäljare" }, { status: 404 });
  return Response.json({ reseller, quotes: await quotesFor(reseller.id) });
}

function update(fn: (r: Reseller) => void) {
  return updateShop((s) => {
    const r = s.resellers.find((x) => x.id === CURRENT_RESELLER);
    if (!r) return null;
    fn(r);
    r.updatedAt = new Date().toISOString();
    return r;
  });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const d = parsed.data;

  if (d.action === "save") {
    const r = await update((r) => {
      const { theme, texts, ...rest } = d.patch;
      Object.assign(r, rest);
      if (theme) r.theme = theme;
      if (texts) r.texts = texts;
    });
    return r ? Response.json({ reseller: r }) : Response.json({ error: "Okänd återförsäljare" }, { status: 404 });
  }

  if (d.action === "publish") {
    const current = await getReseller(CURRENT_RESELLER);
    if (!current?.logo || !current.products.length || !current.texts.heroTitle) return Response.json({ error: "Butiken behöver logga, rubrik och minst en produkt innan den kan publiceras." }, { status: 400 });
    const r = await update((r) => {
      r.status = "publicerad";
      r.publishedAt = new Date().toISOString();
    });
    return Response.json({ reseller: r });
  }

  if (d.action === "unpublish") {
    const r = await update((r) => {
      r.status = "utkast";
    });
    return Response.json({ reseller: r });
  }

  if (d.action === "reset") {
    const r = await update((r) => Object.assign(r, blankReseller(r)));
    return Response.json({ reseller: r });
  }

  const site = d.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const [logo, page] = await Promise.all([logoFromUrl(site).catch((e) => (e instanceof LogoError ? e : new LogoError("Kunde inte hämta loggan."))), scrapeSite(site, { deadlineMs: 40_000 }).catch(() => null)]);
  if (logo instanceof LogoError && !page) return Response.json({ error: "Kunde inte öppna webbplatsen. Kontrollera adressen eller ladda upp loggan som fil." }, { status: 422 });

  const theme = logo instanceof LogoError ? null : await themeFromLogo(logo);
  const suggestion = page ? await writeTexts(page).catch((e) => (console.error("reseller import", errorMessage(e)), fallbackTexts(page))) : null;

  const r = await update((r) => {
    r.website = site;
    r.importedFrom = site;
    if (!(logo instanceof LogoError)) {
      r.logo = logo.light;
      r.logoDark = logo.dark;
    }
    if (theme) r.theme = theme;
    if (suggestion) {
      r.texts = { ...r.texts, ...suggestion.texts };
      if (!r.products.length) r.products = suggestion.products;
    }
  });
  return Response.json({
    reseller: r,
    found: { logo: !(logo instanceof LogoError), texts: Boolean(suggestion), products: suggestion?.products.length ?? 0, mode: suggestion?.mode ?? null },
    note: logo instanceof LogoError ? `${logo.message} Ladda upp loggan som fil.` : "",
  });
}

/** Märkesfärg från loggan, en andra färg som accent (eller samma om loggan är enfärgad) och en ljus bakgrund i samma ton. */
async function themeFromLogo(logo: LogoResult): Promise<Reseller["theme"]> {
  const primary = /^#[0-9a-f]{6}$/i.test(logo.color) ? logo.color.toUpperCase() : "#1D1D1F";
  let accent: string | null = null;
  const file = await loadFile(logo.light.split("/").pop() ?? "");
  if (file && file.type === "image/png") {
    const { data, info } = await sharp(file.data).resize(120, 120, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 50 || max < 60) continue;
      const key = [r, g, b].map((v) => Math.round(v / 32) * 32).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const p = rgb(primary);
    for (const [key] of [...counts].sort((a, b) => b[1] - a[1])) {
      const c = key.split(",").map(Number) as [number, number, number];
      if (Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) > 120) {
        accent = toHex(c);
        break;
      }
    }
  }
  return { primary, accent: accent ?? primary, background: mix(primary, "#FFFFFF", 0.95) };
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

type Suggestion = { texts: Partial<ShopTexts>; products: string[]; mode: "ai" | "demo" };

const contact = (page: SiteScrape) => ({
  email: page.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "",
  phone: page.text.match(/(?:\+46|0)\s?\d{1,3}[\s-]?\d{2,3}[\s-]?\d{2}[\s-]?\d{2}/)?.[0] ?? "",
});

function fallbackTexts(page: SiteScrape): Suggestion {
  const name = (page.siteName || page.title.split(/\s[|–-]\s/)[0] || page.host).slice(0, 60);
  return {
    mode: "demo",
    texts: {
      shopName: name,
      tagline: page.description.split(/(?<=\.)\s/)[0]?.slice(0, 120) ?? "",
      heroTitle: "Er logga på allt ni bär och delar ut",
      heroText: "Välj produkter, ladda upp loggan och se resultatet direkt. Ni får offerten på en gång.",
      about: page.description.slice(0, 600),
      ...contact(page),
    },
    products: ["p001", "p004", "p005", "p011", "p014", "p021", "p024", "p026"],
  };
}

const textSchema = {
  type: "object",
  additionalProperties: false,
  required: ["shopName", "tagline", "heroTitle", "heroText", "about", "products"],
  properties: {
    shopName: { type: "string" },
    tagline: { type: "string" },
    heroTitle: { type: "string" },
    heroText: { type: "string" },
    about: { type: "string" },
    products: { type: "array", items: { type: "string", enum: SHOP_CATALOG.map((p) => p.id) } },
  },
};

async function writeTexts(page: SiteScrape): Promise<Suggestion> {
  if (!hasOpenAIKey()) return fallbackTexts(page);
  const out = await generateJson<Omit<ShopTexts, "email" | "phone"> & { products: string[] }>({
    system: `Du bygger en webbshop åt en återförsäljare av profilprodukter och merch. Företagskunder går in i shoppen, laddar upp sin logga, ser den på produkterna och begär offert.
Läs återförsäljarens webbplats och skriv shoppens texter på svenska, i deras ton. Hitta inte på fakta, priser eller årtal som inte står på sidan.
- shopName: företagets namn som det skrivs på sidan.
- tagline: max 10 ord om vad de gör och för vem.
- heroTitle: rubrik på startsidan, max 8 ord, riktad till företagskunden.
- heroText: 1–2 meningar som säger att man kan ladda upp loggan, se den i 3D och få offert direkt.
- about: 2–3 meningar om företaget utifrån sidan.
- products: 10–16 produkt-id ur katalogen som passar deras kunder.

Katalog:
${SHOP_CATALOG.map((p) => `${p.id} ${p.name} (${p.category})`).join("\n")}`,
    user: `Webbplats ${page.url}
Titel: ${page.title}
Beskrivning: ${page.description}
Meny: ${page.nav.slice(0, 30).join(" · ")}
Rubriker: ${page.headings.slice(0, 30).join(" · ")}
Text:
${page.text.slice(0, 3500)}`,
    schemaName: "reseller_shop",
    schema: textSchema,
  });
  const { products, ...texts } = out;
  return { mode: "ai", texts: { ...texts, ...contact(page) }, products: [...new Set(products)].slice(0, 16) };
}
