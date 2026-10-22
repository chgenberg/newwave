import { grasrotClub } from "@/lib/newwave/grasrot/clubs";
import { parseFileName, printFile } from "@/lib/newwave/grasrot/files";
import { heroImage } from "@/lib/newwave/grasrot/hero";
import { productMockup } from "@/lib/newwave/grasrot/mockup";
import { grasrotPackage } from "@/lib/newwave/grasrot/package";
import { buildProductionFile, findProductionFile, productionOrder, productionSheet } from "@/lib/newwave/grasrot/production";
import { grasrotProduct, productColor } from "@/lib/newwave/grasrot/products";
import { SOCIAL_FORMATS, type SocialFormat, socialSlides } from "@/lib/newwave/grasrot/social";

export const maxDuration = 120;

const MIME: Record<string, string> = { pdf: "application/pdf", eps: "application/postscript", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", csv: "text/csv; charset=utf-8" };

/**
 * En fil ur en förenings Gräsrot 360-leverans, byggd på begäran:
 * tryckfilerna (`ordmarke-negativ-spot.pdf`), produktbilderna (`mockup-tshirt-navy.jpg`), `herobild.jpg`, inläggen
 * (`social-feed-02-tshirt.jpg`), produktionsfilerna (`keps-front-klubbmarke-original-spot.pdf`), produktionsbladen
 * (`produktionsblad-keps.pdf`), `produktionsorder.csv` – eller allt som `paket.zip`. `?dl=1` laddar ner filen.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const download = new URL(req.url).searchParams.has("dl");
  const reply = (data: Buffer | string, name: string) =>
    new Response(typeof data === "string" ? data : new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[name.split(".").pop()!] ?? "application/octet-stream",
        "Cache-Control": "private, no-cache",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
      },
    });
  const missing = () => new Response("Hittades inte", { status: 404 });
  if (!grasrotClub(id)) return missing();

  if (file === "paket.zip") {
    const pack = await grasrotPackage(id);
    if (!pack) return missing();
    return new Response(new Uint8Array(pack.data), { headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-cache", "Content-Disposition": `attachment; filename="${pack.name}"` } });
  }
  if (file === "herobild.jpg") {
    const hero = await heroImage(id);
    return hero ? reply(hero.jpg, `${id}-herobild.jpg`) : missing();
  }
  if (file === "produktionsorder.csv") return reply(await productionOrder(id), `${id}-produktionsorder.csv`);

  const mockup = /^mockup-([a-z]+)-([a-z-]+)\.jpg$/.exec(file);
  if (mockup) {
    const product = grasrotProduct(mockup[1]);
    const color = product && productColor(product, mockup[2]);
    const jpg = color && (await productMockup(id, product, color));
    return jpg ? reply(jpg, `${id}-${product.id}-${color.id}.jpg`) : missing();
  }
  const social = /^social-(feed|story)-(\d\d-[a-z]+)\.jpg$/.exec(file);
  if (social && social[1] in SOCIAL_FORMATS) {
    const slide = (await socialSlides(id, social[1] as SocialFormat, social[2]))?.[0];
    return slide ? reply(slide.jpg, `${id}-${social[1]}-${slide.name}.jpg`) : missing();
  }
  const sheet = /^produktionsblad-([a-z]+)\.pdf$/.exec(file);
  if (sheet) {
    const product = grasrotProduct(sheet[1]);
    const pdf = product && (await productionSheet(id, product));
    return pdf ? reply(pdf, `${id}-${product.id}-produktionsblad.pdf`) : missing();
  }
  const job = await findProductionFile(id, file);
  if (job) {
    const out = await buildProductionFile(id, job);
    return out ? reply(out.data, `${id}-${job.name}`) : missing();
  }

  const parsed = parseFileName(file);
  const out = parsed && (await printFile(id, parsed.artwork, parsed.opts));
  return out ? reply(out.data, out.name) : missing();
}
