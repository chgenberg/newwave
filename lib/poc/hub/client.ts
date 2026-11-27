import { simulatedErpRef, simulateFail } from "../erp";
import { hubApiKey, hubConfig, type HubConfig } from "./config";
import * as map from "./mapping";
import type { HubClient, HubProduct, StockItem } from "./types";

/**
 * Klienten mot New Waves hubb. `hub()` ger den simulerade (standard, svarar själv som Crafts affärssystem gjort i
 * demot) eller den riktiga över HTTP, efter `HUB_MODE` vid varje anrop. Bara utkorgen (outbox.ts) skickar ordrar och
 * avbokningar med den, så att varje anrop får nya försök och larm.
 *
 * HTTP-klienten skickar JSON med nyckeln i `HUB_AUTH_HEADER` (standard `Authorization: Bearer <nyckel>`), vårt
 * ordernummer i `Idempotency-Key` och en tidsgräns på 15 s. Ändpunkterna och fältnamnen ligger i mapping.ts.
 */

export { hubConfig };
export type { HubConfig };

/**
 * Varför ett anrop misslyckades. "inställning": hubben går inte att anropa som den är inställd (adress eller nyckel
 * saknas, eller nyckeln nekas med 401/403) – det rättas i miljön, inte genom att ge upp ordern. "nät" och "tidsgräns":
 * hubben nåddes inte. "svar": hubben svarade med ett fel.
 */
export type HubErrorKind = "inställning" | "nät" | "tidsgräns" | "svar";

export class HubError extends Error {
  readonly retry: boolean;
  readonly kind: HubErrorKind;
  readonly status?: number;
  /** Hubbens Retry-After, i millisekunder. */
  readonly retryAfterMs?: number;
  constructor(message: string, opts: { retry: boolean; kind: HubErrorKind; status?: number; retryAfterMs?: number }) {
    super(message);
    this.name = "HubError";
    this.retry = opts.retry;
    this.kind = opts.kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
  /** Felet gäller hubben som helhet (nere, överbelastad eller inte inställd), inte en enskild post: övriga poster får vänta. */
  get hubWide(): boolean {
    return this.kind !== "svar" || (this.status !== undefined && (this.status >= 500 || this.status === 408 || this.status === 429));
  }
}

/** Svarskoderna som är värda ett nytt försök. Övriga 4xx betyder att hubben nekat just det här anropet. */
const RETRY_STATUS = (s: number) => s >= 500 || s === 408 || s === 425 || s === 429;

const USER_AGENT = "NextWave-Commerce-Hub/1.0";

/** Retry-After i sekunder eller som datum, i millisekunder (högst ett dygn). */
function retryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const s = Number(v);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 24 * 60 * 60_000) : undefined;
}

const causeOf = (e: unknown) => {
  const c = (e as { cause?: { code?: string; message?: string } })?.cause;
  return c?.code ?? c?.message ?? (e instanceof Error ? e.message : String(e));
};

function parse(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Felet när hubben i http-läget inte går att anropa som den är inställd, annars null. Utkorgen frågar innan den bygger ordern. */
export function setupError(cfg: HubConfig = hubConfig()): HubError | null {
  if (cfg.mode !== "http" || (cfg.ready && cfg.url && hubApiKey())) return null;
  return new HubError(`Hubben är inte inställd: ${cfg.problems.join("; ") || "HUB_API_URL eller HUB_API_KEY saknas"}`, { retry: true, kind: "inställning" });
}

/** Ett anrop till hubben. Ger svaret vid 2xx, annars kastas `HubError`. */
async function call(req: map.HubRequest, idempotencyKey?: string): Promise<{ status: number; body: unknown }> {
  const cfg = hubConfig();
  const key = hubApiKey();
  const notReady = setupError(cfg);
  if (notReady || !cfg.url || !key) throw notReady ?? setupError()!;

  const headers: Record<string, string> = { accept: "application/json", "user-agent": USER_AGENT };
  // En nyckel som redan har sitt schema ("Basic …") skickas som den är.
  headers[cfg.authHeader] = cfg.bearer && !/\s/.test(key) ? `Bearer ${key}` : key;
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  if (req.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${cfg.url}${req.path}`, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
      // En omdirigering följs inte, så att nyckeln aldrig skickas vidare till en annan adress.
      redirect: "manual",
    });
    text = await res.text();
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new HubError(`Hubben svarade inte inom ${Math.round(cfg.timeoutMs / 1000)} s`, { retry: true, kind: "tidsgräns" });
    throw new HubError(`Hubben gick inte att nå (${causeOf(e)})`, { retry: true, kind: "nät" });
  }

  const body = parse(text);
  if (res.status >= 200 && res.status < 300) return { status: res.status, body };
  const detail = map.readError(body);
  const what = `Hubben svarade ${res.status}${detail ? `: ${detail}` : ""}`;
  if (res.status >= 300 && res.status < 400) {
    throw new HubError(`Hubben svarade med en omdirigering (${res.status}) – kontrollera HUB_API_URL`, { retry: true, kind: "inställning", status: res.status });
  }
  if (res.status === 401 || res.status === 403) {
    throw new HubError(`${what} – nyckeln nekas, kontrollera HUB_API_KEY och HUB_AUTH_HEADER`, { retry: true, kind: "inställning", status: res.status });
  }
  throw new HubError(what, { retry: RETRY_STATUS(res.status), kind: "svar", status: res.status, retryAfterMs: retryAfter(res.headers.get("retry-after")) });
}

/** Hämtar alla sidor (högst 200), så länge hubben ger en markör till nästa. */
async function allPages<T>(request: (page?: string) => map.HubRequest, read: (body: unknown) => map.Page<T>, what: string): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  let page: string | undefined;
  let skipped = 0;
  for (let i = 0; i < 200; i++) {
    const r = read((await call(request(page))).body);
    out.push(...r.items);
    skipped += r.skipped;
    if (!r.next || seen.has(r.next)) break;
    seen.add(r.next);
    page = r.next;
  }
  if (skipped) console.warn(`poc/hubb ${what}: ${skipped} rader i hubbens svar gick inte att läsa och hoppades över`);
  return out;
}

const httpHub: HubClient = {
  mode: "http",
  async submitOrder(order, idempotencyKey) {
    const r = await call(map.submitOrderRequest(order), idempotencyKey);
    return map.readSubmitResponse(r.status, r.body);
  },
  async cancelOrder(orderNumber, reason, idempotencyKey) {
    try {
      await call(map.cancelOrderRequest(orderNumber, reason), idempotencyKey);
      return { found: true };
    } catch (e) {
      if (e instanceof HubError && e.status !== undefined && map.CANCEL_NOT_FOUND.includes(e.status)) return { found: false };
      throw e;
    }
  },
  fetchStock: (since?: string): Promise<StockItem[]> => allPages((page) => map.stockRequest(since, page), map.readStock, "lagret"),
  fetchProducts: (since?: string): Promise<HubProduct[]> => allPages((page) => map.productsRequest(since, page), map.readProducts, "produkterna"),
};

/** Det simulerade affärssystemet (lib/poc/erp.ts): bekräftar direkt med CR-SO-nummer. `ERP_SIMULATE_FAIL=1` får det att fallera. */
const simulatedHub: HubClient = {
  mode: "simulerad",
  async submitOrder(order) {
    if (simulateFail()) throw new HubError("Simulerat fel: affärssystemet svarar inte (ERP_SIMULATE_FAIL)", { retry: true, kind: "nät" });
    return { erpRef: simulatedErpRef(order) };
  },
  async cancelOrder() {
    if (simulateFail()) throw new HubError("Simulerat fel: affärssystemet svarar inte (ERP_SIMULATE_FAIL)", { retry: true, kind: "nät" });
    return { found: true };
  },
};

/** Klienten efter `HUB_MODE` just nu. */
export function hub(): HubClient {
  return hubConfig().mode === "http" ? httpHub : simulatedHub;
}
