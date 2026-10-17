import { z } from "zod";
import { LogoError } from "@/lib/logo";
import { SHOP_CATALOG, type Reseller } from "@/lib/newwave/reseller";
import { importSite, isHost, siteHost } from "@/lib/newwave/resellerImport";
import { CURRENT_RESELLER, getReseller, quotesFor, updateShop } from "@/lib/newwave/shopState";

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
      r.publishedAt ??= new Date().toISOString();
    });
    return Response.json({ reseller: r });
  }

  if (d.action === "unpublish") {
    const r = await update((r) => {
      r.status = "utkast";
    });
    return Response.json({ reseller: r });
  }

  const host = siteHost(d.website);
  if (!isHost(host)) return Response.json({ error: "Skriv en webbadress, till exempel foretaget.se." }, { status: 400 });
  const found = await importSite(host).catch((e) => (e instanceof LogoError ? e : new LogoError("Kunde inte hämta webbplatsen.")));
  if (found instanceof LogoError) return Response.json({ error: found.message }, { status: 422 });

  const r = await update((r) => {
    r.website = host;
    r.importedFrom = host;
    if (found.name) r.name = found.name.slice(0, 60);
    if (found.city) r.city = found.city;
    if (found.logo) {
      r.logo = found.logo;
      r.logoDark = found.logoDark;
    }
    if (found.theme) r.theme = found.theme;
    r.texts = { shopName: r.name, tagline: "", heroTitle: "", heroText: "", about: "", email: "", phone: "", ...found.texts };
    r.products = found.products;
    if (found.markup !== undefined) r.markup = found.markup;
  });
  return Response.json({ reseller: r, note: found.note });
}
