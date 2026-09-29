import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLUBS } from "@/lib/club";

const TYPES: Record<string, string> = { svg: "image/svg+xml", png: "image/png", json: "application/json" };

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string; file: string }> }) {
  const { clubId, file } = await ctx.params;
  if (!CLUBS[clubId] || !/^[a-z0-9-]+\.(svg|png|json)$/.test(file)) return new Response("Hittades inte", { status: 404 });
  const candidates = [
    path.join(process.cwd(), ".data", "brand", clubId, "kit", file),
    path.join(process.cwd(), "brand-kits", clubId, file),
  ];
  for (const candidate of candidates) {
    const data = await readFile(candidate).catch(() => null);
    if (!data) continue;
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[file.split(".").pop()!], "Cache-Control": "public, max-age=3600" },
    });
  }
  return new Response("Hittades inte", { status: 404 });
}
