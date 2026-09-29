import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLUBS } from "@/lib/club";

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", json: "application/json" };

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string; file: string }> }) {
  const { clubId, file } = await ctx.params;
  if (!CLUBS[clubId] || !/^[a-z0-9-]+\.(svg|png|json)$/.test(file)) return new Response("Hittades inte", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), ".data", "brand", clubId, "kit", file));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[file.split(".").pop()!], "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response("Hittades inte", { status: 404 });
  }
}
