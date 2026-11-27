import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Producer, Role, Session } from "./types";

/**
 * Inloggning per roll i POC-flödet: Craft, stickeriet och tryckeriet. Ett lösenord per roll i miljön
 * (`CRAFT_PASSWORD`, `STICKERI_PASSWORD`, `TRYCKERI_PASSWORD`, demovärden lokalt). Sessionen ligger i en cookie
 * signerad med HMAC-SHA256 (`POC_SESSION_SECRET`) och kan bära flera roller, så att man i en demo kan vara Craft och
 * stickeriet i samma webbläsare. Varje roll gäller i 12 timmar. Producenternas system använder i stället sin
 * API-nyckel (`x-api-key`). Allt ligger ovanpå demots gemensamma lösenord i proxy.ts.
 */

export const ROLES = ["craft", "stickeri", "tryckeri"] as const satisfies readonly Role[];
export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);

/** Som rollen skrivs i löptext: "Logga in som Craft", "Logga in som stickeriet". */
export const ROLE_NAME: Record<Role, string> = { craft: "Craft", stickeri: "stickeriet", tryckeri: "tryckeriet" };

/** Dit rollen kommer efter inloggningen när ingen annan sida anges. */
export const ROLE_HOME: Record<Role, string> = { craft: "/newwave/craft/ordrar", stickeri: "/producent/stickeri", tryckeri: "/producent/tryckeri" };

export const SESSION_COOKIE = "nw-poc-session";
export const SESSION_MAX_AGE = 12 * 60 * 60;

const PROD = process.env.NODE_ENV === "production";
const PASSWORD_ENV: Record<Role, string> = { craft: "CRAFT_PASSWORD", stickeri: "STICKERI_PASSWORD", tryckeri: "TRYCKERI_PASSWORD" };

if (PROD) {
  const missing = [...Object.values(PASSWORD_ENV), "POC_SESSION_SECRET", "PRODUCER_KEY_STICKERI", "PRODUCER_KEY_TRYCKERI", "INTERSPORT_API_KEY"].filter((n) => !process.env[n]);
  if (missing.length) console.warn(`poc/auth: ${missing.join(", ")} saknas i miljön – den inloggningen och de nycklarna är avstängda tills de är satta.`);
}

/**
 * Demovärdena ("demo-craft", "demo-stickeri-key" …) står i koden och gäller bara vid utveckling. I produktion finns
 * ingen reserv: saknas lösenordet eller nyckeln i miljön går den inloggningen eller det API:t inte att använda alls.
 */
const passwordOf = (role: Role): string | null => process.env[PASSWORD_ENV[role]] || (PROD ? null : `demo-${role}`);

/** Utvecklingsstandarden står i koden. I produktion utan egen hemlighet härleds den ur databasens adress, som inte är publik. */
function secret() {
  if (process.env.POC_SESSION_SECRET) return process.env.POC_SESSION_SECRET;
  if (PROD && process.env.DATABASE_URL) return createHash("sha256").update(`nw-poc-session:${process.env.DATABASE_URL}`).digest("hex");
  return "nw-poc-utveckling-inte-hemlig";
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Jämför en hemlighet i konstant tid. Båda hashas först, så att inte heller längden läcker. */
export function keyOk(given: unknown, want: string | null): boolean {
  return Boolean(want) && typeof given === "string" && given.length > 0 && timingSafeEqual(digest(given), digest(want!));
}

// ── Producenternas API-nycklar ──────────────────────────────────────────────

const producerKey = (p: Producer): string | null => (p === "stickeri" ? process.env.PRODUCER_KEY_STICKERI : process.env.PRODUCER_KEY_TRYCKERI) || (PROD ? null : `demo-${p}-key`);

/** Butikens nyckel till flödets order-API (x-api-key). Samma regel: demonyckeln bara vid utveckling. */
export const shopKey = (): string | null => process.env.INTERSPORT_API_KEY || (PROD ? null : "demo-intersport-key");

/** Stämmer nyckeln för producenten? */
export const producerKeyOk = (producer: Producer, key: string | null | undefined) => keyOk(key, producerKey(producer));

// ── Sessionscookien ─────────────────────────────────────────────────────────

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

const encode = (list: Session[]) => {
  const body = Buffer.from(JSON.stringify(list)).toString("base64url");
  return `${body}.${sign(body)}`;
};

/** Rollerna i cookien som är signerade och inte gått ut. `exp` är i millisekunder. */
export function decodeSession(value: string | undefined, now = Date.now()): Session[] {
  if (!value || value.length > 2000) return [];
  const [body, sig, extra] = value.split(".");
  if (!body || !sig || extra !== undefined) return [];
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return [];
  try {
    const list: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Array.isArray(list)) return [];
    return list.filter((s): s is Session => isRole(s?.role) && typeof s?.exp === "number" && s.exp > now);
  } catch {
    return [];
  }
}

const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: PROD, maxAge, path: "/" });

async function sessions(): Promise<Session[]> {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Skriver cookien. Den lever lika länge som den roll som går ut sist. Bara i serveråtgärder och routes. */
async function save(list: Session[]) {
  const jar = await cookies();
  if (!list.length) {
    jar.set(SESSION_COOKIE, "", cookieOptions(0));
    return;
  }
  const maxAge = Math.ceil((Math.max(...list.map((s) => s.exp)) - Date.now()) / 1000);
  jar.set(SESSION_COOKIE, encode(list), cookieOptions(maxAge));
}

// ── Inloggning ──────────────────────────────────────────────────────────────

/**
 * Den guidade demon (/newwave/demo): Crafts lösenord, eller en redan inloggad Craft, ger alla tre rollerna på en gång,
 * så att visningen går från Craft till shoppen och producenterna utan fler inloggningar. Bara i serveråtgärder och routes.
 */
export async function loginDemo(password: string | null): Promise<boolean> {
  const craft = (await sessions()).some((s) => s.role === "craft");
  if (!craft && !keyOk(password ?? "", passwordOf("craft"))) return false;
  await save(ROLES.map((role) => ({ role, exp: Date.now() + SESSION_MAX_AGE * 1000 })));
  return true;
}

/** Loggar in rollen om lösenordet stämmer, och behåller rollerna som redan är inloggade. Bara i serveråtgärder och routes. */
export async function login(role: Role, password: string): Promise<boolean> {
  if (!isRole(role) || !keyOk(password, passwordOf(role))) return false;
  const others = (await sessions()).filter((s) => s.role !== role);
  await save([...others, { role, exp: Date.now() + SESSION_MAX_AGE * 1000 }]);
  return true;
}

/** Loggar ut rollen, eller alla roller. Ger rollerna som är kvar. Bara i serveråtgärder och routes. */
export async function logout(role?: Role): Promise<Role[]> {
  const left = role ? (await sessions()).filter((s) => s.role !== role) : [];
  await save(left);
  return left.map((s) => s.role);
}

/** De inloggade rollerna, för serversidor. */
export async function currentRoles(): Promise<Role[]> {
  return (await sessions()).map((s) => s.role);
}

export async function hasRole(role: Role): Promise<boolean> {
  return (await currentRoles()).includes(role);
}

/** En sökväg på den här sajten, eller null. Hindrar att inloggningen blir en öppen omdirigering. */
export function internalPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.length > 1000) return null;
  const base = "http://sajten.invalid";
  try {
    const url = new URL(raw, base);
    return url.origin === base ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

/** Inloggningssidan för rollen, med sidan att komma tillbaka till. */
export function loginPath(role: Role, next?: string) {
  const q = new URLSearchParams({ roll: role });
  const back = internalPath(next);
  if (back) q.set("next", back);
  return `/logga-in?${q}`;
}

/** För serversidor: skickar till inloggningen om rollen inte är inloggad. `next` är sidan att komma tillbaka till. */
export async function requireRole(role: Role, next: string = ROLE_HOME[role]): Promise<void> {
  if (!(await hasRole(role))) redirect(loginPath(role, next));
}

function cookieFrom(req: Request, name: string) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
}

/**
 * För routes: har anropet rollen? Via sessionscookien, eller för producenterna via API-nyckeln i `x-api-key`. Ger hur,
 * eller null.
 */
export async function roleFromRequest(req: Request, role: Role): Promise<"session" | "nyckel" | null> {
  if (decodeSession(cookieFrom(req, SESSION_COOKIE)).some((s) => s.role === role)) return "session";
  if (role !== "craft" && producerKeyOk(role, req.headers.get("x-api-key"))) return "nyckel";
  return null;
}
