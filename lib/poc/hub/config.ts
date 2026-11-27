import type { HubMode } from "./types";

/**
 * Inställningarna för kopplingen mot New Waves hubb, ur miljön (docs/poc-flode.md, "Steg 4"). Läses vid varje anrop,
 * så att en ändrad variabel gäller direkt och så att skripten kan sätta dem själva. Nyckelns och hemligheternas värden
 * lämnar aldrig den här filen: `hubConfig()` säger bara om de finns.
 *
 * I http-läget fallerar hubben stängt: saknas adressen eller nyckeln (eller är de ogiltiga) skickas ingenting, ordrarna
 * väntar i utkorgen och ett larm går. Det faller aldrig tillbaka på simuleringen.
 */

export const DEFAULT_PUBLIC_BASE_URL = "https://www.nextwaveproduction.se";
/** Två veckor. */
export const DEFAULT_FILE_TTL_H = 336;
/** Längsta tid ett anrop till hubben får ta, svaret inräknat. */
export const HUB_TIMEOUT_MS = 15_000;

export type HubConfig = {
  mode: HubMode;
  /** Hubbens adress utan avslutande snedstreck, när den är satt och giltig. */
  url?: string;
  /** Rubriken som bär nyckeln. */
  authHeader: string;
  /** Nyckeln skickas som `Bearer <nyckel>` (rubriken Authorization). */
  bearer: boolean;
  hasKey: boolean;
  /** HUB_PULL: vi hämtar lager och produkter själva. */
  pull: boolean;
  /** Hur länge fillänkarna till hubben gäller. */
  fileTtlHours: number;
  /** Sajtens adress i länkarna till hubben, utan avslutande snedstreck. */
  publicBaseUrl: string;
  timeoutMs: number;
  /** De andra delarnas hemligheter och adresser: bara om de är satta. */
  webhookSecret: boolean;
  cronKey: boolean;
  alertWebhook: boolean;
  /** Variablerna som saknas eller är ogiltiga för läget, t.ex. ["HUB_API_URL"]. Tomt när hubben går att använda. */
  missing: string[];
  /** Vad som är fel, i klartext, för larmet och Crafts integrationssida. */
  problems: string[];
  /** Hubben går att anropa (simulerad, eller http med giltig adress och nyckel). */
  ready: boolean;
};

const env = (name: string) => process.env[name]?.trim() || undefined;
const yes = (v: string | undefined) => ["1", "true", "ja", "yes", "on"].includes((v ?? "").toLowerCase());

/** En http(s)-adress utan avslutande snedstreck, eller null. */
function baseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Ett HTTP-rubriknamn (token enligt RFC 9110). */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/;

export function hubConfig(): HubConfig {
  const missing: string[] = [];
  const problems: string[] = [];

  const rawMode = (env("HUB_MODE") ?? "simulerad").toLowerCase();
  // Ett okänt läge tolkas som att den riktiga hubben var menad, och fallerar stängt i stället för att simulera.
  const mode: HubMode = rawMode === "simulerad" || rawMode === "simulated" || rawMode === "sim" ? "simulerad" : "http";
  if (mode === "http" && rawMode !== "http") {
    missing.push("HUB_MODE");
    problems.push(`HUB_MODE har ett okänt värde – ange "http" eller "simulerad"`);
  }

  const rawUrl = env("HUB_API_URL");
  const url = baseUrl(rawUrl) ?? undefined;
  const hasKey = Boolean(env("HUB_API_KEY"));
  const rawHeader = env("HUB_AUTH_HEADER") ?? "Authorization";
  const headerOk = HEADER_NAME.test(rawHeader);
  const authHeader = headerOk ? rawHeader : "Authorization";

  if (mode === "http") {
    if (!rawUrl) {
      missing.push("HUB_API_URL");
      problems.push("HUB_API_URL saknas: hubbens adress");
    } else if (!url) {
      missing.push("HUB_API_URL");
      problems.push("HUB_API_URL är ingen giltig http(s)-adress (utan frågetecken, # och inloggning i adressen)");
    }
    if (!hasKey) {
      missing.push("HUB_API_KEY");
      problems.push("HUB_API_KEY saknas: nyckeln till hubben");
    }
    if (!headerOk) {
      missing.push("HUB_AUTH_HEADER");
      problems.push("HUB_AUTH_HEADER är inget giltigt rubriknamn");
    }
  }

  const ttl = Number(env("HUB_FILE_TTL_H") ?? DEFAULT_FILE_TTL_H);
  const fileTtlHours = Number.isFinite(ttl) && ttl >= 1 ? Math.min(Math.round(ttl), 24 * 90) : DEFAULT_FILE_TTL_H;
  const publicBaseUrl = baseUrl(env("PUBLIC_BASE_URL")) ?? DEFAULT_PUBLIC_BASE_URL;
  if (env("PUBLIC_BASE_URL") && !baseUrl(env("PUBLIC_BASE_URL"))) problems.push(`PUBLIC_BASE_URL är ingen giltig adress – ${DEFAULT_PUBLIC_BASE_URL} används`);

  return {
    mode,
    url,
    authHeader,
    bearer: authHeader.toLowerCase() === "authorization",
    hasKey,
    pull: mode === "http" && yes(env("HUB_PULL")),
    fileTtlHours,
    publicBaseUrl,
    timeoutMs: HUB_TIMEOUT_MS,
    webhookSecret: Boolean(env("HUB_WEBHOOK_SECRET")),
    cronKey: Boolean(env("HUB_CRON_KEY")),
    alertWebhook: Boolean(env("ALERT_WEBHOOK_URL")),
    missing,
    problems,
    ready: missing.length === 0,
  };
}

/** Nyckeln till hubben. Bara för klienten (client.ts); skrivs aldrig ut eller skickas någon annanstans. */
export const hubApiKey = (): string | null => env("HUB_API_KEY") ?? null;
