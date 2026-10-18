/**
 * Lösenordet till demot ligger i `DEMO_PASSWORD`; utan det är sajten öppen. Cookien bär en hash av lösenordet, så att
 * ett nytt lösenord loggar ut alla och cookien inte går att skriva själv.
 */
export const ACCESS_COOKIE = "nw-access";
export const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;
export const LOGIN_PATH = "/newwave/las";

/** Öppna utan lösenord: inloggningen, delningsbilden och adresser som andra system hämtar från. */
const OPEN = [LOGIN_PATH, "/newwave/og.jpg", "/newwave/hero-poster.jpg", "/api/mock-intersport", "/api/v1/webhooks/", "/api/v1/newwave/hub/filer/"];

export const isOpen = (path: string) => OPEN.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)));

export async function accessToken(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`nw-access:${password}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vart besökaren ska efter inloggningen: bara en sökväg på den här sajten. */
export function safeNext(raw: unknown) {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 500) return "/newwave";
  const base = "http://sajten.invalid";
  const url = new URL(raw, base);
  return url.origin === base ? url.pathname + url.search + url.hash : "/newwave";
}
