import { hasRole, loginPath as roleLoginPath, logout, requireRole, roleFromRequest } from "@/lib/poc/auth";
import type { Producer } from "@/lib/poc/types";

/**
 * Åtkomsten till stickeriets och tryckeriets köer: producenten loggar in med sitt lösenord på /logga-in (lib/poc/auth.ts),
 * och sessionen kontrolleras på varje sida, i varje knapp och vid varje nedladdning. Köerna går bara via de här
 * funktionerna, så att inloggningen kan bytas utan att resten ändras.
 */

export const queuePath = (p: Producer) => `/producent/${p}`;

/** Inloggningssidan, med vägen tillbaka till kön (eller en annan sida i den). */
export const loginPath = (p: Producer, next = queuePath(p)) => roleLoginPath(p, next);

/** För sidor: skickar till inloggningen om producenten inte är inloggad. */
export async function requireProducer(p: Producer, next = queuePath(p)) {
  await requireRole(p, next);
}

/** För serveråtgärder: är producenten inloggad? */
export const hasProducerAccess = (p: Producer) => hasRole(p);

/** För routes: inloggad i webbläsaren, eller producentens system med sin API-nyckel. */
export const producerRequestOk = async (req: Request, p: Producer) => (await roleFromRequest(req, p)) !== null;

export async function dropProducerAccess(p: Producer) {
  await logout(p);
}
