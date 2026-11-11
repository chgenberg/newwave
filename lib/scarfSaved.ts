import type { ScarfInfo } from "@/components/ScarfParts";
import type { ScarfCopy, ScarfMaterial } from "./scarfChannels";
import type { Level, ScarfIdea } from "./scarfRecipes";

/**
 * Sparade designer: halsdukarna en besökare har tagit fram ligger kvar i webbläsaren (IndexedDB), så att de går att
 * hitta igen utan konto. Inget skickas till servern. Bilderna sparas med, så att sidan visas direkt; stickfilerna
 * packas på nytt av servern från idén när de hämtas.
 */

export type SavedDesign = {
  /** Körningens tidpunkt och halsdukens nyckel – en ändrad halsduk skriver över sin tidigare version. */
  id: string;
  runAt: number;
  savedAt: number;
  /** Platsen bland körningens tre förslag. */
  order: number;
  club: { ref: string; name: string; crest: string; brand: boolean };
  title: string;
  recipeLabel: string;
  level: Level;
  /** Det servern behöver för att packa stickfilerna igen. */
  download: { clubId: string; idea: ScarfIdea; artFile?: string | null; photoFile?: string | null; signFile?: string | null };
  /** Bilderna, texten, garnerna, kontrollen och omdömet – det kortet och popuprutan visar. */
  info: ScarfInfo;
  stopped: boolean;
  /** Materialet för sociala medier, om det här motivet valdes. Filerna ligger på servern. */
  made: { copy: ScarfCopy; material: ScarfMaterial; notes: string[] } | null;
};

const DB = "nw-halsdukar";
const STORE = "designer";
/** De äldsta rensas bort när listan blir längre än så här. */
const KEEP = 150;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Kör mot lagret och ger frågans svar. Går det inte (privat läge, fullt utrymme) blir svaret `fallback` – sidan ska fungera ändå. */
async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void, fallback: T): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      let value = fallback;
      if (req) req.onsuccess = () => (value = req.result);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    } catch {
      resolve(fallback);
    } finally {
      // Stängs när transaktionen är klar.
      db.close();
    }
  });
}

/** Alla sparade designer, de senaste först. */
export async function savedDesigns(): Promise<SavedDesign[]> {
  const all = await store<SavedDesign[]>("readonly", (s) => s.getAll(), []);
  return all.sort((a, b) => b.runAt - a.runAt || a.order - b.order);
}

export const savedCount = () => store<number>("readonly", (s) => s.count(), 0);

export async function removeDesign(id: string) {
  await store("readwrite", (s) => void s.delete(id), null);
}

export async function saveDesign(design: SavedDesign) {
  await store("readwrite", (s) => void s.put(design), null);
  const all = await savedDesigns();
  for (const old of all.slice(KEEP)) await removeDesign(old.id);
}
