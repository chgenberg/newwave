import { SOCIAL, type SocialFormat, socialFile } from "@/lib/newwave/wordmark/serve";
import { parseWordmarkQuery } from "@/lib/newwave/wordmark/spec";

/** Wordmarket för sociala medier på klubbens huvudfärg: wordmarkets parametrar plus f=profil|banner|story|anim. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const format = params.get("f") ?? "";
  params.delete("f");
  params.set("s", "1200");
  const q = parseWordmarkQuery(params);
  if (!q || !(format in SOCIAL)) return new Response("Ogiltig förfrågan", { status: 400 });
  const file = await socialFile(q, format as SocialFormat);
  if (!file) return new Response("Hittades inte", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": file.type, "Cache-Control": "private, max-age=86400" };
  if (format === "anim") headers["Content-Security-Policy"] = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  return new Response(new Uint8Array(file.data), { headers });
}
