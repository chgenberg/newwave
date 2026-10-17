import JSZip from "jszip";
import { apiPayload, getDelivery, readHubFile } from "@/lib/newwave/hubDelivery";

export const maxDuration = 60;

/** Leveransen som New Waves hub tog emot: API-anropet som JSON, eller med `?zip=1` alla filer i en mapp per jobb. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await getDelivery(id);
  if (!d) return Response.json({ error: "Hittades inte" }, { status: 404 });
  const payload = apiPayload(d);
  if (!new URL(req.url).searchParams.has("zip")) return Response.json(payload, { headers: { "Cache-Control": "no-store" } });

  const zip = new JSZip();
  zip.file("leverans.json", JSON.stringify(payload, null, 2));
  for (const [i, j] of d.jobs.entries()) {
    const folder = zip.folder(`${String(i + 1).padStart(2, "0")}-${j.productId}-${j.method}${j.position > 1 ? `-tryck${j.position}` : ""}`)!;
    for (const f of j.files) {
      const data = await readHubFile(j.key, f.name);
      if (data) folder.file(f.name, data);
    }
  }
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new Response(body as BodyInit, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${d.id}.zip"`, "Cache-Control": "no-store" },
  });
}
