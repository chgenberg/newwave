import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadFile } from "@/lib/store";
import { CLUBS_DIR } from "./clubRegistry";
import { parseWordmarkUrl } from "./wordmark/spec";

const FILE = /^\/api\/v1\/files\/([0-9a-f-]{36}\.(?:png|jpg|svg))$/;
const BRAND = /^\/api\/v1\/brand\/([a-z0-9-]+)\/([a-z0-9-]+\.png)$/;
const PUBLIC = /^\/newwave\/[A-Za-z0-9/_-]+\.(?:png|jpg)$/;
const REGISTRY = /^\/api\/v1\/newwave\/registry\/([a-z0-9-]{1,80})\/logo\.png(?:\?v=[^&#]*)?$/;
const GRASROT = /^\/api\/v1\/newwave\/grasrot\/([a-z0-9-]{1,80})\/([a-z0-9-]+\.png)$/;

/** En bild som sajten själv serverar, läst från disk: uppladdade filer, klubbarnas sköldar, klubbregistrets märken, Gräsrot 360-märkena, wordmarks och allt under public/newwave. */
export async function readAsset(url: string): Promise<Buffer | null> {
  const wordmark = parseWordmarkUrl(url);
  if (wordmark) {
    const { wordmarkFile } = await import("./wordmark/serve");
    return (await wordmarkFile({ ...wordmark, format: "png" }))?.data ?? null;
  }
  const file = FILE.exec(url);
  if (file) return (await loadFile(file[1]))?.data ?? null;
  const registry = REGISTRY.exec(url);
  if (registry) return readFile(path.join(CLUBS_DIR, "logos", `${registry[1]}.png`)).catch(() => null);
  const grasrot = GRASROT.exec(url);
  if (grasrot) {
    const { parseFileName, printData } = await import("./grasrot/files");
    const parsed = parseFileName(grasrot[2]);
    return parsed ? ((await printData(grasrot[1], parsed.artwork, parsed.opts))?.data ?? null) : null;
  }
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
