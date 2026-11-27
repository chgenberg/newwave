import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * API-beskrivningen för kopplingen mot New Waves hubb, åt båda hållen (docs/hubb-api.yaml, OpenAPI 3.1). Öppen, så att
 * New Waves IT kan läsa den direkt; den innehåller inga nycklar. `?ladda=1` ger den som fil att spara.
 */
export async function GET(req: Request) {
  try {
    const yaml = await readFile(path.join(process.cwd(), "docs", "hubb-api.yaml"), "utf8");
    const download = new URL(req.url).searchParams.has("ladda");
    return new Response(yaml, {
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        ...(download ? { "Content-Disposition": 'attachment; filename="nextwave-hubb-api.yaml"' } : {}),
      },
    });
  } catch (e) {
    console.error("hub/openapi", e instanceof Error ? e.message : e);
    return Response.json({ error: "API-beskrivningen saknas" }, { status: 500 });
  }
}
