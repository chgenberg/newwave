import type { ScarfInfo } from "@/components/ScarfParts";
import type { ScarfCopy, ScarfMaterial } from "./scarfChannels";
import type { Level, ScarfIdea } from "./scarfRecipes";

/**
 * Sparade designer: det motiv en besökare har valt i en körning, med materialet som gjordes för det, ligger kvar i
 * webbläsaren (IndexedDB) så att det går att hitta igen utan konto. En design per körning – väljs ett annat motiv i
 * samma körning ersätter det den förra. Inget skickas till servern. Halsdukens bilder sparas med, så att sidan visas
 * direkt; stickfilerna packas på nytt av servern från idén när de hämtas, och materialets filer ligger på servern.
 */

export type SavedDesign = {
  /** Körningens tidpunkt: en design per körning. */
  id: string;
  runAt: number;
  savedAt: number;
  club: { ref: string; name: string; crest: string; brand: boolean };
  title: string;
  recipeLabel: string;
  level: Level;
  /** Det servern behöver för att packa stickfilerna igen. */
  download: { clubId: string; idea: ScarfIdea; artFile?: string | null; photoFile?: string | null; signFile?: string | null };
  /** Bilderna, texten, garnerna, kontrollen och omdömet – det kortet och popuprutan visar. */
  info: ScarfInfo;
  stopped: boolean;
  /** Materialet för sociala medier. Filerna ligger på servern. Äldre poster kan sakna det – de visas inte och rensas bort. */
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

/** Alla sparade designer, de senaste först. Förslag som sparades utan att väljas (en tidigare version sparade alla tre) rensas bort. */
export async function savedDesigns(): Promise<SavedDesign[]> {
  const all = await store<SavedDesign[]>("readonly", (s) => s.getAll(), []);
  for (const d of all) if (!d.made) await removeDesign(d.id);
  return all.filter((d) => d.made).sort((a, b) => b.runAt - a.runAt);
}

export const savedCount = async () => (await savedDesigns()).length;

export async function removeDesign(id: string) {
  await store("readwrite", (s) => void s.delete(id), null);
}

export async function saveDesign(design: SavedDesign) {
  await store("readwrite", (s) => void s.put(design), null);
  const all = await savedDesigns();
  for (const old of all.slice(KEEP)) await removeDesign(old.id);
}
