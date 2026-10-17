import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { scrapeSite, type SiteScrape } from "@/lib/demoSite";
import { LogoError, logoFromUrl, type LogoResult } from "@/lib/logo";
import { errorMessage, generateJson, hasOpenAIKey } from "@/lib/openai";
import { loadFile } from "@/lib/store";
import { SHOP_CATALOG, SHOP_PACKS, type Reseller, type ShopTexts } from "./reseller";
import { mix } from "./theme";

/** Det en webbplats ger butiken. Exemplen och tidigare hämtade adresser svarar direkt, utan att sidan läses eller AI anropas. */
export type SiteImport = {
  host: string;
  name?: string;
  city?: string;
  logo?: string;
  logoDark?: string;
  theme?: Reseller["theme"];
  texts?: Partial<ShopTexts>;
  products: string[];
  markup?: number;
  note: string;
};

const R = (slug: string) => ({ logo: `/newwave/resellers/${slug}/logo.png`, logoDark: `/newwave/resellers/${slug}/logo-vit.png` });
const pack = (id: string) => SHOP_PACKS.find((p) => p.id === id)!.products;

export const EXAMPLE_SITES: (SiteImport & { label: string })[] = [
  {
    host: "vastkustprofil.se",
    label: "Västkust Profil, Kungsbacka",
    name: "Västkust Profil",
    city: "Kungsbacka",
    ...R("vastkust-profil"),
    theme: { primary: "#0E3B43", accent: "#F2B23E", background: "#F6F4EF" },
    texts: {
      shopName: "Västkust Profil",
      tagline: "Profilkläder och merch till företag i Halland",
      heroTitle: "Er logga på allt ni bär och delar ut",
      heroText: "Ladda upp loggan, se den på produkten i 3D och få en offert direkt. Vi trycker i Sverige och levererar på två veckor.",
      about: "Vi har klätt företag, föreningar och event på västkusten sedan 2009. Ni får en kontaktperson, ett provtryck innan vi kör och leverans till dörren.",
      email: "order@vastkustprofil.se",
      phone: "0300-12 34 56",
    },
    products: ["p001", "p002", "p004", "p005", "p007", "p009", "p011", "p013", "p016", "p019", "p021", "p024", "p026", "p029", "p031", "p034", "p037"],
    markup: 10,
    note: "",
  },
  {
    host: "kustlinjetryck.se",
    label: "Kustlinje Tryck, Göteborg",
    name: "Kustlinje Tryck",
    city: "Göteborg",
    ...R("kustlinje-tryck"),
    theme: { primary: "#12355B", accent: "#FF6B4A", background: "#F3F6F9" },
    texts: {
      shopName: "Kustlinje Tryck",
      tagline: "Tryck och profilprodukter från Göteborg",
      heroTitle: "Snyggt tryck, snabbt levererat",
      heroText: "Ladda upp loggan, se den på produkten i 3D och få en offert direkt. Vi trycker i Göteborg och levererar inom tio arbetsdagar.",
      about: "Kustlinje Tryck är ett tryckeri och en profilbyrå i Göteborg. Vi hjälper företag, rederier och evenemang med kläder och giveaways, från tio till tiotusen exemplar.",
      email: "hej@kustlinjetryck.se",
      phone: "031-70 80 90",
    },
    products: [...new Set([...pack("event"), "p004", "p005", "p029"])],
    markup: 12,
    note: "",
  },
  {
    host: "fjallprofil.se",
    label: "Fjällprofil, Östersund",
    name: "Fjällprofil",
    city: "Östersund",
    ...R("fjallprofil"),
    theme: { primary: "#1F3D2B", accent: "#E9B44C", background: "#F5F3EC" },
    texts: {
      shopName: "Fjällprofil",
      tagline: "Profilkläder för jobb och fjäll i Jämtland",
      heroTitle: "Kläder som tål både jobb och fjäll",
      heroText: "Välj plagg, ladda upp loggan och se resultatet i 3D. Ni får priset direkt och offerten samma dag.",
      about: "Fjällprofil klär hantverkare, turistföretag och skidklubbar i Jämtland och Härjedalen. Vi broderar och trycker plagg som håller i minus tjugo.",
      email: "order@fjallprofil.se",
      phone: "063-12 00 45",
    },
    products: [...new Set([...pack("arbete"), "p013", "p015", "p021"])],
    markup: 18,
    note: "",
  },
];

/** Hämtade adresser sparas för alla besökare, så att samma webbplats bara läses och skrivs om en gång. */
const CACHE = path.join(process.cwd(), ".data", "newwave", "site-import");
const cacheFile = (host: string) => path.join(CACHE, `${host}.json`);

export const siteHost = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

export const isHost = (host: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host.length <= 100;

export async function importSite(host: string): Promise<SiteImport> {
  const example = EXAMPLE_SITES.find((e) => e.host === host);
  if (example) return example;
  const cached = await readFile(cacheFile(host), "utf8")
    .then((raw) => JSON.parse(raw) as SiteImport)
    .catch(() => null);
  if (cached) return cached;

  const [logo, page] = await Promise.all([logoFromUrl(host).catch((e) => (e instanceof LogoError ? e : new LogoError("Kunde inte hämta loggan."))), scrapeSite(host, { deadlineMs: 40_000 }).catch(() => null)]);
  if (logo instanceof LogoError && !page) throw new LogoError("Kunde inte öppna webbplatsen. Kontrollera adressen eller ladda upp loggan som fil.");

  const suggestion = page ? await writeTexts(page).catch((e) => (console.error("reseller import", errorMessage(e)), fallbackTexts(page))) : null;
  const found: SiteImport = {
    host,
    name: suggestion?.texts.shopName,
    ...(logo instanceof LogoError ? {} : { logo: logo.light, logoDark: logo.dark, theme: await themeFromLogo(logo) }),
    texts: suggestion?.texts,
    products: suggestion?.products.length ? suggestion.products : pack("foretag"),
    note: logo instanceof LogoError ? `${logo.message} Ladda upp loggan som fil under Varumärke.` : "",
  };
  await mkdir(CACHE, { recursive: true });
  await writeFile(cacheFile(host), JSON.stringify(found));
  return found;
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

type Suggestion = { texts: Partial<ShopTexts>; products: string[] };

const contact = (page: SiteScrape) => ({
  email: page.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? "",
  phone: page.text.match(/(?:\+46|0)\s?\d{1,3}[\s-]?\d{2,3}[\s-]?\d{2}[\s-]?\d{2}/)?.[0] ?? "",
});

function fallbackTexts(page: SiteScrape): Suggestion {
  const name = (page.siteName || page.title.split(/\s[|–-]\s/)[0] || page.host).slice(0, 60);
  return {
    texts: {
      shopName: name,
      tagline: page.description.split(/(?<=\.)\s/)[0]?.slice(0, 120) ?? "",
      heroTitle: "Er logga på allt ni bär och delar ut",
      heroText: "Välj produkter, ladda upp loggan och se resultatet direkt. Ni får offerten på en gång.",
      about: page.description.slice(0, 600),
      ...contact(page),
    },
    products: pack("foretag"),
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
  return { texts: { ...texts, ...contact(page) }, products: [...new Set(products)].slice(0, 16) };
}
