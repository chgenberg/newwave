import { COLLECTION_FILE, loadCollection } from "@/lib/newwave/clubCollection";
import { loadFile } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; file: string }> };

/** En bild ur klubbens kollektion – bara filer som hör till klubbens publicerade produkter. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id, file } = await ctx.params;
  if (!COLLECTION_FILE.test(file) || !(await loadCollection(id)).files.has(file)) return new Response("Hittades inte", { status: 404 });
  const f = await loadFile(file);
  if (!f) return new Response("Hittades inte", { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.type, "Cache-Control": "private, max-age=86400" } });
}
