import { clientIp, createLimiter } from "@/lib/demoLimit";
import { PHOTO_MAX_BYTES, savePhoto, shopPhoto } from "@/lib/newwave/clubShopContent";
import { wordmarkClub } from "@/lib/newwave/wordmark/store";

type Ctx = { params: Promise<{ id: string }> };

const uploads = createLimiter(() => ({ perKey: 12, global: 300, windowMs: 10 * 60_000 }));
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Klubbens eget foto överst i butiken. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await wordmarkClub(id))) return Response.json({ error: "Klubben finns inte." }, { status: 404 });
  if (!uploads.take(clientIp(req)).ok) return Response.json({ error: "För många uppladdningar. Vänta en stund." }, { status: 429 });
  const length = Number(req.headers.get("content-length"));
  if (!length) return Response.json({ error: "Välj en bild i jpg, png, webp eller heic." }, { status: 411 });
  if (length > PHOTO_MAX_BYTES + 100_000) return Response.json({ error: "Bilden får vara högst 10 MB." }, { status: 413 });
  const file = (await req.formData().catch(() => null))?.get("foto");
  if (!(file instanceof File) || !TYPES.has(file.type)) return Response.json({ error: "Välj en bild i jpg, png, webp eller heic." }, { status: 400 });
  if (file.size > PHOTO_MAX_BYTES) return Response.json({ error: "Bilden får vara högst 10 MB." }, { status: 413 });
  try {
    const content = await savePhoto(id, Buffer.from(await file.arrayBuffer()));
    return Response.json({ content, photo: await shopPhoto(id, content) });
  } catch (e) {
    const msg = e instanceof Error && e.message.startsWith("Bilden") ? e.message : "Bilden gick inte att läsa. Prova en annan.";
    return Response.json({ error: msg }, { status: 400 });
  }
}
