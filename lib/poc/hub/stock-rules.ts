/**
 * Lagrets regler, utan databas: hur ett saldo från New Waves hubb matchas mot en storlek och en färg, när en storlek är
 * slut eller har få kvar, och texterna som shoppen, kassan och Crafts vyer visar. Delas av servern
 * (lib/poc/hub/stock.ts) och webbläsaren (shoppens köpruta, kassan, Crafts shoppar och klubbkollektion).
 *
 * Reglerna (docs/poc-flode.md, "Steg 4"):
 * - En artikel som hubben aldrig rapporterat säljs som i dag, obegränsat (`tracked: false`).
 * - När hubben rapporterat en artikel räknas saldot. En storlek eller färg som saknas säljs som förut, tills artikeln
 *   funnits i ett fullständigt lager (`complete`): då är det som saknas slut.
 * - En rad utan storlek eller färg gäller alla storlekar eller färger. Den mest precisa raden vinner.
 * - Färgen matchas på färgkoden (#RRGGBB) eller på namnet – klubbproduktens eget och katalogens namn för samma kod.
 */

/** Så här många kvar, eller färre, visas som "få kvar". */
export const FEW_LEFT = 5;

/**
 * En rad i lagret. Tom `size` eller `color` gäller alla storlekar eller färger. `available` är det som går att sälja nu:
 * hubbens saldo, minus det som reserverats för ordrar som hubben bekräftat efter sitt senaste besked.
 */
export type StockRow = { size: string; color: string; available: number; incoming: number; eta?: string; updatedAt: string };

/**
 * Lagret för en artikel. `tracked`: hubben har rapporterat artikeln, så saldot räknas. `complete`: artikeln har funnits i
 * ett fullständigt lager, så storlekar och färger utan rad är slut.
 */
export type SkuStock = { sku: string; tracked: boolean; complete: boolean; rows: StockRow[] };

export type StockState = "obegränsat" | "i lager" | "få kvar" | "slut";

/** Läget för en storlek. `available` är null när saldot inte räknas (obegränsat). `eta` är ett datum (ÅÅÅÅ-MM-DD). */
export type SizeStock = { size: string; state: StockState; available: number | null; incoming?: number; eta?: string };

/** Plaggets färg i matchningen: färgkoden och namnen färgen har (klubbproduktens och katalogens). */
export type ColorRef = { hex?: string; names: string[] };

/** Texten för en produkts lagerläge och hur den ska se ut: "slut" (rött) eller "få" (gult). */
export type StockLabel = { text: string; tone: "slut" | "få" };

/** Lagret för en produkt i en färg, storlek för storlek. */
export type ProductStock = { tracked: boolean; sizes: SizeStock[]; soldOut: boolean; few: boolean; label: StockLabel | null };

const fold = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");

/** Samma storlek med olika stavning: "One size", "ONESIZE" och "OS"; "2XL" och "XXL". */
const SIZE_ALIAS: Record<string, string> = { os: "onesize", ensize: "onesize", enstorlek: "onesize", "2xl": "xxl", "3xl": "xxxl", "4xl": "xxxxl" };

export const sizeKey = (s: string | undefined) => {
  const k = fold(s ?? "");
  return SIZE_ALIAS[k] ?? k;
};

const HEX = /^#?([0-9a-f]{6})$/i;
const hexOf = (s: string | undefined) => {
  const m = HEX.exec((s ?? "").trim());
  return m ? `#${m[1].toUpperCase()}` : undefined;
};

/** Färgen för matchningen: koden och namnet, och katalogens namn på samma kod (t.ex. "White" för klubbproduktens "Vit"). */
export function colorRef(c: { hex?: string; name?: string } | null | undefined, palette: readonly { name: string; hex: string }[] = []): ColorRef | undefined {
  const hex = hexOf(c?.hex);
  const names = [c?.name, ...(hex ? palette.filter((p) => hexOf(p.hex) === hex).map((p) => p.name) : [])].filter((n): n is string => Boolean(n?.trim()));
  return hex || names.length ? { hex, names: [...new Set(names)] } : undefined;
}

/** Plaggets färg ur klubbproduktens `spec` (lib/poc/build.ts): den valda färgen, annars plaggets. Halsduken har ingen. */
export function specColor(spec: Record<string, unknown> | undefined, palette: readonly { name: string; hex: string }[] = []): ColorRef | undefined {
  const s = spec as { kind?: unknown; color?: { hex?: unknown; name?: unknown }; product?: { garment?: unknown } } | undefined;
  if (s?.kind !== "plagg") return undefined;
  const hex = typeof s.color?.hex === "string" ? s.color.hex : typeof s.product?.garment === "string" ? s.product.garment : undefined;
  return colorRef({ hex, name: typeof s.color?.name === "string" ? s.color.name : undefined }, palette);
}

function colorMatches(row: string, ref: ColorRef) {
  const hex = hexOf(row);
  if (hex) return hex === ref.hex;
  const k = fold(row);
  return ref.names.some((n) => fold(n) === k);
}

/**
 * Raderna som gäller storleken och färgen: först raderna för just storleken, annars de som gäller alla storlekar. Med
 * färg väljs färgens rad, annars en rad utan färg; utan färg räknas alla färgerna ihop.
 */
export function rowsFor(stock: Pick<SkuStock, "rows">, size: string | undefined, color?: ColorRef): StockRow[] {
  const k = sizeKey(size);
  const levels = [stock.rows.filter((r) => r.size.trim() && sizeKey(r.size) === k), stock.rows.filter((r) => !r.size.trim())];
  for (const level of levels) {
    if (!level.length) continue;
    if (!color) return level;
    const own = level.find((r) => r.color.trim() && colorMatches(r.color, color));
    if (own) return [own];
    const any = level.find((r) => !r.color.trim());
    if (any) return [any];
  }
  return [];
}

const soonest = (rows: StockRow[]) =>
  rows
    .filter((r) => r.incoming > 0 && r.eta)
    .map((r) => r.eta!)
    .sort()[0];

/** Läget för en storlek i en färg (utan färg: alla färger ihop). */
export function sizeStock(stock: SkuStock | undefined, size: string, color?: ColorRef): SizeStock {
  if (!stock?.tracked) return { size, state: "obegränsat", available: null };
  const rows = rowsFor(stock, size, color);
  if (!rows.length) return stock.complete ? { size, state: "slut", available: 0 } : { size, state: "obegränsat", available: null };
  const available = rows.reduce((n, r) => n + Math.max(0, r.available), 0);
  const incoming = rows.reduce((n, r) => n + Math.max(0, r.incoming), 0);
  const eta = soonest(rows);
  return { size, state: available <= 0 ? "slut" : available <= FEW_LEFT ? "få kvar" : "i lager", available, ...(incoming ? { incoming } : {}), ...(eta ? { eta } : {}) };
}

/** "S", "S och M", "S, M och L". */
export const listSv = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} och ${items.at(-1)}`);

const day = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", timeZone: "Europe/Stockholm" });

/** Väntat datum i text, "12 december"; ett datum som passerat ger ingen text. */
export function etaText(eta: string | undefined, now = Date.now()): string | null {
  if (!eta) return null;
  const t = Date.parse(eta.length === 10 ? `${eta}T12:00:00Z` : eta);
  if (Number.isNaN(t) || t < now - 86_400_000) return null;
  return day.format(new Date(t));
}

/** "Fler väntas 12 december." / "Fler är på väg." – när något är på väg. */
export function incomingText(s: Pick<SizeStock, "incoming" | "eta">): string | null {
  if (!s.incoming) return null;
  const when = etaText(s.eta);
  return when ? `Fler väntas ${when}.` : "Fler är på väg.";
}

const ONE_SIZE = (sizes: readonly string[]) => sizes.length <= 1;

/**
 * Lagret för en produkt i en färg, med texten: "Tillfälligt slut" när allt är slut, "Slut i M och L", "Få kvar i S", eller
 * inget när det finns gott om allt (eller saldot inte räknas).
 */
export function productStock(stock: SkuStock | undefined, sizes: readonly string[], color?: ColorRef): ProductStock {
  const list = (sizes.length ? sizes : ["One size"]).map((s) => sizeStock(stock, s, color));
  const tracked = Boolean(stock?.tracked);
  const out = list.filter((s) => s.state === "slut");
  const few = list.filter((s) => s.state === "få kvar");
  const soldOut = tracked && out.length === list.length;
  let label: StockLabel | null = null;
  if (soldOut) {
    const when = etaText(list.filter((s) => s.incoming && s.eta).map((s) => s.eta!).sort()[0]);
    label = { text: when ? `Tillfälligt slut – fler väntas ${when}` : "Tillfälligt slut", tone: "slut" };
  } else if (out.length) label = { text: `Slut i ${listSv(out.map((s) => s.size))}${few.length ? ` · få kvar i ${listSv(few.map((s) => s.size))}` : ""}`, tone: "slut" };
  else if (few.length) label = { text: ONE_SIZE(sizes) ? `Få kvar (${few[0].available} st)` : `Få kvar i ${listSv(few.map((s) => s.size))}`, tone: "få" };
  return { tracked, sizes: list, soldOut, few: few.length > 0, label };
}

/** Färgerna som hubben rapporterat för artikeln (radernas egna namn eller koder). */
export const stockColors = (stock: SkuStock | undefined) => [...new Set((stock?.rows ?? []).map((r) => r.color.trim()).filter(Boolean))];
