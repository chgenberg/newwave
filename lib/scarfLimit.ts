import { clientIp, createLimiter, envInt } from "./demoLimit";

/**
 * Spärrar för halsduksagenten, per besökare och timme. Varje steg som anropar en modell kostar pengar, och alla med
 * lösenordet når rutterna. En körning är ett anrop till idéerna; gränserna för stickning och granskning är satta så att
 * körningarna tar slut först. Alla går att ändra med SCARF_<NAMN>_PER_IP_HOUR och SCARF_<NAMN>_GLOBAL_HOUR.
 */

const HOUR = 60 * 60_000;
const limiter = (name: string, perKey: number, global: number) =>
  createLimiter(() => ({ perKey: envInt(`SCARF_${name}_PER_IP_HOUR`, perKey), global: envInt(`SCARF_${name}_GLOBAL_HOUR`, global), windowMs: HOUR }));

const LIMITS = {
  /** En körning: agenten tar fram en ny kollektion. */
  run: { take: limiter("RUNS", 30, 120), error: "Flödet har körts många gånger den senaste timmen. Försök igen om en stund." },
  /** En halsduk görs om: underkänd av granskaren, eller ändrad av beställaren med egna ord. */
  redo: { take: limiter("REDO", 120, 500), error: "Många halsdukar har gjorts om den senaste timmen. Försök igen om en stund." },
  knit: { take: limiter("KNIT", 500, 2500), error: "Många halsdukar har stickats den senaste timmen. Försök igen om en stund." },
  /** Bildmodellen ritar ett motiv. */
  draw: { take: limiter("DRAW", 40, 160), error: "Bildmodellen har ritat många motiv den senaste timmen." },
  review: { take: limiter("REVIEW", 400, 2000), error: "Granskaren har sett många halsdukar den senaste timmen. Försök igen om en stund." },
  pack: { take: limiter("PACK", 200, 1000), error: "Många stickfiler har hämtats den senaste timmen. Försök igen om en stund." },
  upload: { take: limiter("UPLOAD", 80, 400), error: "Många bilder har laddats upp den senaste timmen. Försök igen om en stund." },
  /** Materialet för ett valt motiv: texterna (språkmodellen), fotografierna (bildmodellen, två per gång), och bilderna och filmerna (servern). */
  copy: { take: limiter("COPY", 40, 160), error: "Agenten har skrivit många texter den senaste timmen. Försök igen om en stund." },
  shoot: { take: limiter("SHOOT", 20, 80), error: "Bildmodellen har tagit många fotografier den senaste timmen." },
  media: { take: limiter("MEDIA", 120, 500), error: "Mycket material har skapats den senaste timmen. Försök igen om en stund." },
  film: { take: limiter("FILM", 80, 320), error: "Många filmer har klippts den senaste timmen. Försök igen om en stund." },
};

export type ScarfLimit = keyof typeof LIMITS;

/** True om anropet ryms. */
export const scarfAllowed = (req: Request, what: ScarfLimit) => LIMITS[what].take.take(clientIp(req)).ok;

/** Svaret att skicka när gränsen är nådd, annars null. */
export function scarfLimit(req: Request, what: ScarfLimit): Response | null {
  const verdict = LIMITS[what].take.take(clientIp(req));
  if (verdict.ok) return null;
  return Response.json({ error: LIMITS[what].error }, { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } });
}
