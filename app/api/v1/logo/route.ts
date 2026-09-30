import { z } from "zod";
import { LogoError, logoFromFile, logoFromUrl } from "@/lib/logo";

export const maxDuration = 60;

const Body = z.union([
  z.object({ url: z.string().min(3).max(500) }),
  z.object({ dataUrl: z.string().regex(/^data:image\/(png|jpeg|svg\+xml|webp)[^,]*;base64,/).max(8_000_000), name: z.string().max(80).optional() }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  try {
    const d = parsed.data;
    const logo = "url" in d ? await logoFromUrl(d.url) : await logoFromFile(Buffer.from(d.dataUrl.split(",")[1], "base64"), d.name || "Ditt företag");
    return Response.json(logo);
  } catch (e) {
    const message = e instanceof LogoError ? e.message : "Kunde inte hämta loggan.";
    return Response.json({ error: message }, { status: 422 });
  }
}
