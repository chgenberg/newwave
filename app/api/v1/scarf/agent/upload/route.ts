import sharp from "sharp";
import { z } from "zod";
import { readJson } from "@/lib/demoLimit";
import { SignSchema } from "@/lib/scarfFlow";
import { scarfLimit } from "@/lib/scarfLimit";
import { saveFile } from "@/lib/store";

export const maxDuration = 60;

const Body = z.discriminatedUnion("kind", [
  /** Beställarens eget foto till porträtthalsduken. */
  z.object({ kind: z.literal("photo"), dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(5_600_000) }),
  /** Namnteckningar ritade för hand. */
  z.object({ kind: z.literal("sign"), strokes: SignSchema.shape.strokes }),
]);

/** Det beställaren själv lägger till en halsduk. Svaret är filens namn, som skickas med när halsduken stickas. */
export async function POST(req: Request) {
  const limited = scarfLimit(req, "upload");
  if (limited) return limited;
  const body = await readJson(req, 6_000_000);
  if (body === undefined) return Response.json({ error: "Bilden är för stor – välj en under 4 MB." }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Kunde inte läsa det som laddades upp." }, { status: 400 });
  if (parsed.data.kind === "sign") return Response.json({ file: (await saveFile(JSON.stringify({ v: 1, strokes: parsed.data.strokes }), "json")).id });
  // Fotot vänds rätt efter kamerans uppgift och sparas i den storlek porträttet stickas från.
  const jpg = await sharp(Buffer.from(parsed.data.dataUrl.split(",")[1] ?? "", "base64"), { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#FFFFFF" })
    .jpeg({ quality: 90 })
    .toBuffer()
    .catch(() => null);
  if (!jpg) return Response.json({ error: "Kunde inte läsa fotot – prova JPG eller PNG." }, { status: 400 });
  return Response.json({ file: (await saveFile(jpg, "jpg")).id });
}
