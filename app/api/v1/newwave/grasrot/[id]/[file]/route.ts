import { stored } from "@/lib/newwave/grasrot/cache";
import { grasrotClub } from "@/lib/newwave/grasrot/clubs";
import { parseFileName, printFile } from "@/lib/newwave/grasrot/files";
import { heroImage } from "@/lib/newwave/grasrot/hero";
import { productMockup } from "@/lib/newwave/grasrot/mockup";
import { grasrotPackage } from "@/lib/newwave/grasrot/package";
import { buildProductionFile, findProductionFile, productionOrder, productionSheet } from "@/lib/newwave/grasrot/production";
import { grasrotProduct, productColor } from "@/lib/newwave/grasrot/products";
import { captionText, SOCIAL_FORMATS, type SocialFormat, socialSlides } from "@/lib/newwave/grasrot/social";

export const maxDuration = 120;

const MIME: Record<string, string> = { pdf: "application/pdf", eps: "application/postscript", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8", zip: "application/zip" };

/** Filen med namnet, eller null om namnet inte finns i leveransen. */
async function make(id: string, file: string): Promise<Buffer | string | null> {
  if (file === "paket.zip") return (await grasrotPackage(id))?.data ?? null;
  if (file === "herobild.jpg") return (await heroImage(id))?.jpg ?? null;
  if (file === "produktionsorder.csv") return productionOrder(id);
  if (file === "bildtexter.txt") return captionText(grasrotClub(id)!);

  const mockup = /^mockup-([a-z]+)-([a-z-]+)\.jpg$/.exec(file);
  if (mockup) {
    const product = grasrotProduct(mockup[1]);
    const color = product && productColor(product, mockup[2]);
    return color ? stored(id, file, () => productMockup(id, product, color)) : null;
  }
  const social = /^social-(feed|story)-(\d\d-[a-z]+)\.jpg$/.exec(file);
  if (social && social[1] in SOCIAL_FORMATS) return stored(id, file, async () => (await socialSlides(id, social[1] as SocialFormat, social[2]))?.[0]?.jpg ?? null);
  const sheet = /^produktionsblad-([a-z]+)\.pdf$/.exec(file);
  if (sheet) {
    const product = grasrotProduct(sheet[1]);
    return product ? stored(id, file, () => productionSheet(id, product)) : null;
  }
  const job = await findProductionFile(id, file);
  if (job) return stored(id, file, async () => (await buildProductionFile(id, job))?.data ?? null);

  const parsed = parseFileName(file);
  return parsed ? stored(id, file, async () => (await printFile(id, parsed.artwork, parsed.opts))?.data ?? null) : null;
}

/**
 * En fil ur en förenings Gräsrot 360-leverans, byggd på begäran och sparad per deploy:
 * tryckfilerna (`ordmarke-negativ-spot.pdf`), produktbilderna (`mockup-tshirt-navy.jpg`), `herobild.jpg`, inläggen
 * (`social-feed-02-tshirt.jpg`) och `bildtexter.txt`, produktionsfilerna (`keps-front-klubbmarke-original-spot.pdf`),
 * produktionsbladen (`produktionsblad-keps.pdf`), `produktionsorder.csv` – eller allt som `paket.zip`.
 * `?dl=1` laddar ner filen; paketet laddas alltid ner.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const data = grasrotClub(id) ? await make(id, file) : null;
  if (data === null) return new Response("Hittades inte", { status: 404 });
  const body = typeof data === "string" ? Buffer.from(data) : data;
  const name = file === "paket.zip" ? `${id}-grasrot-360.zip` : `${id}-${file}`;
  const download = file === "paket.zip" || new URL(req.url).searchParams.has("dl");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": MIME[file.split(".").pop()!] ?? "application/octet-stream",
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-cache",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
