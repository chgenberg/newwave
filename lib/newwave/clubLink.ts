import { SITE } from "./site";

/**
 * Personliga länkar utan demolösenordet: `?k=` är en signatur av klubbens id, så länken går inte att ändra till en
 * annan klubb och inget behöver sparas. Nyckeln är ADMIN_PASSWORD (annars DEMO_PASSWORD) – byts den slutar alla
 * utskickade länkar att fungera.
 *
 * - Klubbens länk öppnar förhandsvisningen, där klubben rättar och godkänner, dashboarden, där klubben följer butiken
 *   och ändrar dess texter, foto och sortiment, och klubbens butik.
 * - Butikens länk är den klubben delar med medlemmar och supportrar: bara butiken, klubbshoppen hos Intersport där man
 *   köper, och bilderna de visar.
 */
export type LinkScope = "club" | "shop";

export const LINK_COOKIE: Record<LinkScope, string> = { club: "nw-club", shop: "nw-shop" };
export const CLUB_PARAM = "k";
export const CLUB_MAX_AGE = 60 * 60 * 24 * 60;

const ID = /^[a-z0-9-]{1,80}$/;
const PAGE: Record<LinkScope, RegExp> = {
  club: /^\/newwave\/klubbar\/([a-z0-9-]{1,80})(?:\/dashboard(?:\/(?:statistik|webshop))?)?$/,
  shop: /^\/newwave\/klubbar\/([a-z0-9-]{1,80})\/butik(?:\/[a-z0-9-]{1,120})?$/,
};
const INTERSPORT = /^\/intersport\/([a-z0-9-]{1,80})(?:\/[a-z0-9-]{1,120})?$/;

async function sign(scope: LinkScope, id: string) {
  const secret = process.env.ADMIN_PASSWORD || process.env.DEMO_PASSWORD;
  if (!secret || !ID.test(id)) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`nw-club:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(scope === "club" ? id : `shop:${id}`)));
  return Array.from(mac.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function valid(scope: LinkScope, id: string, token: string) {
  const want = await sign(scope, id);
  if (!want || want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** Om cookien från klubbens länk gäller just den här klubben. */
export async function hasClubLink(id: string, cookie: string | undefined) {
  const [owner = "", token = ""] = (cookie ?? "").split(".");
  return owner === id && Boolean(token) && valid("club", id, token);
}

/** Länken som skickas ut; utan lösenord på sajten räcker den vanliga adressen. */
export async function clubLink(id: string, scope: LinkScope = "club") {
  const k = await sign(scope, id);
  return `${SITE}/newwave/klubbar/${id}${scope === "shop" ? "/butik" : ""}${k ? `?${CLUB_PARAM}=${k}` : ""}`;
}

/** Bilderna båda sidorna visar: ordmärken och mockups för klubben, klubbens märke och fotot i butiken. */
function images(id: string, p: string, q: URLSearchParams) {
  if (p === `/api/v1/newwave/registry/${id}/logo.png` || p === `/api/v1/newwave/registry/${id}/bild.jpg`) return true;
  if (p.startsWith(`/api/v1/newwave/clubshop/${id}/foto/`)) return /^foto-\d{13}\.jpg$/.test(p.slice(`/api/v1/newwave/clubshop/${id}/foto/`.length));
  if (p.startsWith(`/api/v1/brand/${id}/`)) return /^[a-z0-9-]+\.(png|svg)$/.test(p.slice(`/api/v1/brand/${id}/`.length));
  if (p === "/api/v1/newwave/wordmark") return q.get("c") === id;
  if (p === "/api/v1/newwave/mockup") {
    const [path, query] = (q.get("l") ?? "").split("?");
    return path === "/api/v1/newwave/wordmark" && new URLSearchParams(query).get("c") === id;
  }
  return false;
}

function inScope(scope: LinkScope, id: string, url: URL, method: string) {
  const { pathname: p, searchParams: q } = url;
  if (scope === "club" && p === `/api/v1/newwave/wordmark/club/${id}`) return method === "GET" || method === "PUT";
  if (scope === "club" && p === `/api/v1/newwave/clubshop/${id}`) return method === "PUT";
  if (scope === "club" && p === `/api/v1/newwave/clubshop/${id}/foto`) return method === "POST";
  if (p === `/api/v1/newwave/clubshop/${id}/event`) return method === "POST";
  if (method !== "GET" && method !== "HEAD") return false;
  if (PAGE.shop.exec(p)?.[1] === id || INTERSPORT.exec(p)?.[1] === id || images(id, p, q)) return true;
  return scope === "club" && (PAGE.club.exec(p)?.[1] === id || ((p === "/api/v1/newwave/wordmark/social" || p === "/api/v1/newwave/wordmark/templates") && q.get("c") === id));
}

/**
 * Klubben som anropet får gälla: från länken (då sätts cookien) eller från en cookie, om anropet hör till det länken
 * öppnar.
 */
export async function clubAccess(url: URL, method: string, cookie: (name: string) => string | undefined): Promise<{ id: string; set?: { name: string; value: string } } | null> {
  const k = url.searchParams.get(CLUB_PARAM);
  for (const scope of ["club", "shop"] as const) {
    const page = PAGE[scope].exec(url.pathname)?.[1];
    if (page && k && (await valid(scope, page, k))) return { id: page, set: { name: LINK_COOKIE[scope], value: `${page}.${k}` } };
  }
  for (const scope of ["club", "shop"] as const) {
    const [id = "", token = ""] = (cookie(LINK_COOKIE[scope]) ?? "").split(".");
    if (id && token && inScope(scope, id, url, method) && (await valid(scope, id, token))) return { id };
  }
  return null;
}
