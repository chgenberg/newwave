import { z } from "zod";
import { LOGO_PRODUCT_IDS } from "@/lib/logoMerch";
import { logoPhotos } from "@/lib/logoPhotos";
import { errorMessage } from "@/lib/openai";
import { fileUrl } from "@/lib/schemas";

export const maxDuration = 300;

const Body = z.object({
  productId: z.string().refine((id) => LOGO_PRODUCT_IDS.includes(id)),
  logo: z.object({ light: fileUrl, dark: fileUrl }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  try {
    return Response.json({ photos: await logoPhotos(parsed.data.productId, parsed.data.logo) });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
