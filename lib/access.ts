/**
 * Lösenordet till demot ligger i `DEMO_PASSWORD`; utan det är sajten öppen. Cookien bär en hash av lösenordet, så att
 * ett nytt lösenord loggar ut alla och cookien inte går att skriva själv. Statistiksidan har ett eget lösenord i
 * `ADMIN_PASSWORD`, eftersom mottagarna av demot har demolösenordet.
 */
export const ACCESS_COOKIE = "nw-access";
export const ADMIN_COOKIE = "nw-admin";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;
export const LOGIN_PATH = "/newwave/las";
export const STATS_PATH = "/newwave/besok";

/** Öppna utan lösenord: inloggningen, besöksloggen och adresser som andra system hämtar från. */
const OPEN = [LOGIN_PATH, "/api/v1/besok", "/api/mock-intersport", "/api/v1/webhooks/", "/api/v1/newwave/hub/filer/"];

/** Bilderna i public: bildoptimeringen hämtar dem internt utan besökarens cookie, och delningsbilden ska synas i chattar. Filmerna kräver lösenordet. */
const PUBLIC_IMAGE = /^\/(?!api\/)[^?#]+\.(?:jpe?g|png|webp|avif|gif|svg|ico)$/i;

export const isOpen = (path: string) => PUBLIC_IMAGE.test(path) || OPEN.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));

export type AccessScope = "access" | "admin";

export async function accessToken(password: string, scope: AccessScope = "access") {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nw-${scope}:${password}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAdmin(cookie: string | undefined) {
  const password = process.env.ADMIN_PASSWORD;
  return Boolean(password && cookie === (await accessToken(password, "admin")));
}

/** Vart besökaren ska efter inloggningen: bara en sökväg på den här sajten. */
export function safeNext(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 500) return "/newwave";
  const base = "http://sajten.invalid";
  const url = new URL(raw, base);
  return url.origin === base ? url.pathname + url.search + url.hash : "/newwave";
}
