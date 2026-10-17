import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadFile } from "@/lib/store";

const FILE = /^\/api\/v1\/files\/([0-9a-f-]{36}\.(?:png|jpg|svg))$/;
const BRAND = /^\/api\/v1\/brand\/([a-z0-9-]+)\/([a-z0-9-]+\.png)$/;
const PUBLIC = /^\/newwave\/[A-Za-z0-9/_-]+\.(?:png|jpg)$/;

/** En bild som sajten själv serverar, läst från disk: uppladdade filer, klubbarnas sköldar och allt under public/newwave. */
export async function readAsset(url: string): Promise<Buffer | null> {
  const file = FILE.exec(url);
  if (file) return (await loadFile(file[1]))?.data ?? null;
  const brand = BRAND.exec(url);
  if (brand) {
    for (const p of [path.join(process.cwd(), ".data", "brand", brand[1], "kit", brand[2]), path.join(process.cwd(), "brand-kits", brand[1], brand[2])]) {
      const data = await readFile(p).catch(() => null);
      if (data) return data;
    }
    return null;
  }
  return PUBLIC.test(url) ? readFile(path.join(process.cwd(), "public", url)).catch(() => null) : null;
}
