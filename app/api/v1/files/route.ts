import { z } from "zod";
import { saveFile } from "@/lib/store";

const Body = z.object({ dataUrl: z.string().regex(/^data:(image\/png|video\/mp4|video\/webm)[^,]*;base64,/) });
const EXT = { "image/png": "png", "video/mp4": "mp4", "video/webm": "webm" } as const;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig fil" }, { status: 400 });
  const [head, b64] = parsed.data.dataUrl.split(",");
  const mime = head.slice(5).split(/[;,]/)[0] as keyof typeof EXT;
  const file = await saveFile(Buffer.from(b64, "base64"), EXT[mime]);
  return Response.json(file);
}
