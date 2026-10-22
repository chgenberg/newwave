import { SITE } from "./site";

/**
 * Klubbens personliga länk till förhandsvisningen: `?k=` är en signatur av klubbens id, så länken går inte att ändra
 * till en annan klubb och inget behöver sparas. Nyckeln är ADMIN_PASSWORD (annars DEMO_PASSWORD) – byts den slutar
 * alla utskickade länkar att fungera. Länken öppnar bara klubbens sida och anropen sidan själv gör.
 */
export const CLUB_COOKIE = "nw-club";
export const CLUB_PARAM = "k";
export const CLUB_MAX_AGE = 60 * 60 * 24 * 60;

const ID = /^[a-z0-9-]{1,80}$/;
const PAGE = /^\/newwave\/klubbar\/([a-z0-9-]{1,80})$/;

async function sign(id: string) {
  const secret = process.env.ADMIN_PASSWORD || process.env.DEMO_PASSWORD;
  if (!secret || !ID.test(id)) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`nw-club:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id)));
  return Array.from(mac.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function valid(id: string, token: string) {
  const want = await sign(id);
  if (!want || want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** Länken som skickas till klubben; utan lösenord på sajten räcker den vanliga adressen. */
export async function clubLink(id: string) {
  const k = await sign(id);
  return `${SITE}/newwave/klubbar/${id}${k ? `?${CLUB_PARAM}=${k}` : ""}`;
}

/** Det klubbens sida hämtar: sidan, klubbens val och ordmärken, mockups och märket – bara för den klubben. */
function inScope(id: string, url: URL, method: string) {
  const { pathname: p, searchParams: q } = url;
  if (p === `/api/v1/newwave/wordmark/club/${id}`) return method === "GET" || method === "PUT";
  if (method !== "GET" && method !== "HEAD") return false;
  if (p === `/newwave/klubbar/${id}` || p === `/api/v1/newwave/registry/${id}/logo.png`) return true;
  if (p.startsWith(`/api/v1/brand/${id}/`)) return /^[a-z0-9-]+\.(png|svg)$/.test(p.slice(`/api/v1/brand/${id}/`.length));
  if (p === "/api/v1/newwave/wordmark" || p === "/api/v1/newwave/wordmark/social" || p === "/api/v1/newwave/wordmark/templates") return q.get("c") === id;
  if (p === "/api/v1/newwave/mockup") {
    const [path, query] = (q.get("l") ?? "").split("?");
    return path === "/api/v1/newwave/wordmark" && new URLSearchParams(query).get("c") === id;
  }
  return false;
}

/**
 * Klubben som anropet får gälla: från länken på klubbens sida (då sätts cookien) eller från cookien, om anropet hör
 * till klubbens sida.
 */
export async function clubAccess(url: URL, method: string, cookie: string | undefined): Promise<{ id: string; cookie?: string } | null> {
  const page = url.pathname.match(PAGE)?.[1];
  const k = url.searchParams.get(CLUB_PARAM);
  if (page && k && (await valid(page, k))) return { id: page, cookie: `${page}.${k}` };
  const [id = "", token = ""] = (cookie ?? "").split(".");
  return id && token && inScope(id, url, method) && (await valid(id, token)) ? { id } : null;
}
