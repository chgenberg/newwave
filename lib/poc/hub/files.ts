import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BuiltFile } from "../build";
import { getOrderView, listClubProducts } from "../store";
import { PRODUCER_OF, type OrderLine, type OrderView, type Producer } from "../types";
import { hubConfig } from "./config";
import type { HubFile } from "./types";

/**
 * Produktionsfilerna i ordern till hubben (`HubOrderLine.files`), som länkar som hubben eller producenten hämtar med en
 * vanlig GET: `{PUBLIC_BASE_URL}/api/v1/hub/filer/{token}`. Länken är signerad med HMAC-SHA256 (nyckeln härleds ur
 * `POC_SESSION_SECRET`) och gäller i `HUB_FILE_TTL_H` timmar, standard två veckor. Den bär ordern, producenten och
 * filnamnet – inget annat går att hämta med den – och slutar gälla om ordern avbryts.
 *
 * Filerna sparas inte. De byggs ur klubbprodukternas specifikation med samma kod som producenternas filer
 * (lib/poc/build.ts): när ordern skickas, för att få namnen, och igen när länken hämtas. Jobben i databasen skapas först
 * när hubben bekräftat ordern, så filerna byggs för producentens del av ordern (raderna som den tillverkar), med samma
 * namn som i jobbet sedan.
 */

const PROD = process.env.NODE_ENV === "production";

/** Egen nyckel för fillänkarna, härledd ur sessionshemligheten (samma reserv som lib/poc/auth.ts), så att en länk aldrig kan tas för en cookie. */
function key(): Buffer {
  const base = process.env.POC_SESSION_SECRET || (PROD && process.env.DATABASE_URL ? `nw-poc-session:${process.env.DATABASE_URL}` : "nw-poc-utveckling-inte-hemlig");
  return createHash("sha256").update(`nw-hubb-filer:${base}`).digest();
}

type Payload = { /** ordern */ o: string; /** producenten */ p: Producer; /** filnamnet */ n: string; /** går ut, unix-sekunder */ e: number };

const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export function fileToken(p: Payload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export type TokenCheck = { ok: true; payload: Payload } | { ok: false; reason: "ogiltig" | "utgången" };

/** Kontrollerar länkens signatur (i konstant tid) och tid. */
export function readFileToken(token: string, now = Date.now()): TokenCheck {
  if (typeof token !== "string" || token.length > 2000) return { ok: false, reason: "ogiltig" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "ogiltig" };
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "ogiltig" };
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof p?.o !== "string" || (p.p !== "tryckeri" && p.p !== "stickeri") || typeof p.n !== "string" || typeof p.e !== "number") return { ok: false, reason: "ogiltig" };
    if (p.e * 1000 <= now) return { ok: false, reason: "utgången" };
    return { ok: true, payload: p };
  } catch {
    return { ok: false, reason: "ogiltig" };
  }
}

export const hubFileUrl = (token: string) => `${hubConfig().publicBaseUrl}/api/v1/hub/filer/${token}`;

/** Producentens del av ordern, i den form som filbygget tar ett jobb. Id:t är stabilt, så att samma filer byggs varje gång. */
function producerPart(order: Pick<OrderView, "number" | "createdAt" | "lines">, producer: Producer) {
  const lines = order.lines.filter((l) => PRODUCER_OF[l.kind] === producer);
  return { job: { id: `${order.number}-${producer}`, orderNumber: order.number, producer, lineIds: lines.map((l) => l.id), createdAt: order.createdAt }, lines };
}

/** Bygger filerna för producentens del av ordern. Bildmotorerna laddas först här, så att kassan slipper dem. */
async function buildPart(order: Pick<OrderView, "number" | "createdAt" | "lines">, producer: Producer): Promise<BuiltFile[]> {
  const { job, lines } = producerPart(order, producer);
  if (!lines.length) return [];
  const [{ jobFiles }, products] = await Promise.all([import("../build"), listClubProducts({ ids: [...new Set(lines.map((l) => l.clubProductId))] })]);
  return jobFiles(job, lines, products);
}

/**
 * Länkarna till varje rads filer: radens klubbprodukts filer (filnamnen börjar med produktens nummer i producentens
 * del, "01-…"). Rader som samma klubbprodukt i två storlekar delar filer. `missing` är raderna utan filer – deras
 * produkter gick inte att bygga.
 */
export async function hubOrderFiles(order: OrderView, now = Date.now()): Promise<{ byLine: Map<string, HubFile[]>; missing: OrderLine[] }> {
  const exp = Math.floor(now / 1000) + hubConfig().fileTtlHours * 3600;
  const expiresAt = new Date(exp * 1000).toISOString();
  const byLine = new Map<string, HubFile[]>();
  for (const producer of ["stickeri", "tryckeri"] as Producer[]) {
    const { lines } = producerPart(order, producer);
    if (!lines.length) continue;
    const built = await buildPart(order, producer);
    const products = [...new Set(lines.map((l) => l.clubProductId))];
    for (const l of lines) {
      const nr = String(products.indexOf(l.clubProductId) + 1).padStart(2, "0");
      byLine.set(
        l.id,
        built.filter((f) => f.name.startsWith(`${nr}-`)).map((f) => ({ name: f.name, label: f.label, url: hubFileUrl(fileToken({ o: order.id, p: producer, n: f.name, e: exp })), expiresAt })),
      );
    }
  }
  return { byLine, missing: order.lines.filter((l) => !byLine.get(l.id)?.length) };
}

/** Filen bakom en länk, eller varför den inte går att hämta (med HTTP-koden). */
export async function hubFileFor(token: string): Promise<{ file: BuiltFile } | { status: number; error: string }> {
  const t = readFileToken(token);
  if (!t.ok) return t.reason === "utgången" ? { status: 410, error: "Länken har gått ut. Be om en ny länk." } : { status: 403, error: "Länken är ogiltig." };
  const { o, p, n } = t.payload;
  const order = await getOrderView(o);
  if (!order) return { status: 404, error: "Ordern finns inte." };
  if (order.status === "avbruten") return { status: 410, error: `Order ${order.number} är avbruten och ska inte tillverkas.` };
  const file = (await buildPart(order, p)).find((f) => f.name === n);
  return file ? { file } : { status: 404, error: "Filen finns inte i ordern." };
}
