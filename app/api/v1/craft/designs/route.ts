import { z } from "zod";
import { roleFromRequest } from "@/lib/poc/auth";
import { normalizeArt } from "@/lib/poc/build";
import { insertDesign, listDesigns } from "@/lib/poc/store";
import type { Design } from "@/lib/poc/types";
import { findTemplate, publishTemplates, TemplateTaken } from "@/lib/newwave/wordmark/store";

export const maxDuration = 60;

const MAX_BYTES = 10_000_000;
const NAME = z.string().trim().min(1).max(60);
const Wordmark = z.object({ name: NAME, template: z.string().regex(/^[a-z0-9-]{2,40}$/) });
const IMAGE = /^image\/(png|jpeg|webp|svg\+xml)$/;

/** Designen som listan visar den: konstverket som en adress i stället för hela bilden. */
const view = (d: Design) => ({
  id: d.id,
  name: d.name,
  type: d.source.type,
  template: d.source.type === "ordmall" ? d.source.template : undefined,
  art: d.source.type === "fil" ? `/api/v1/craft/designs/${d.id}/art` : undefined,
  createdAt: d.createdAt,
});

export async function GET() {
  try {
    return Response.json({ designs: (await listDesigns()).map(view) });
  } catch (e) {
    console.error("craft/designs", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte läsa designerna." }, { status: 500 });
  }
}

/**
 * Skapar Crafts design. En ordmall: JSON `{ name, template }`. En uppladdad fil: formulär med `name` och `file`
 * (PNG, JPG, WEBP eller SVG). Filen sparas som PNG med genomskinlig bakgrund, i databasen tillsammans med designen.
 * Kräver Crafts inloggning.
 */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft för att spara designer." }, { status: 401 });
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 100_000) return Response.json({ error: "Filen är för stor – max 10 MB." }, { status: 413 });
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      const name = NAME.safeParse(form?.get("name"));
      if (!(file instanceof File) || !name.success) return Response.json({ error: "Välj en fil och ge designen ett namn." }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "Filen är för stor – max 10 MB." }, { status: 413 });
      if (!IMAGE.test(file.type) && !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) return Response.json({ error: "Välj en PNG-, JPG-, WEBP- eller SVG-fil." }, { status: 400 });
      const png = await normalizeArt(Buffer.from(await file.arrayBuffer())).catch(() => null);
      if (!png) return Response.json({ error: "Kunde inte läsa bilden." }, { status: 400 });
      const design = await insertDesign({ name: name.data, source: { type: "fil", artUrl: `data:image/png;base64,${png.toString("base64")}` } });
      return Response.json({ design: view(design) });
    }
    const parsed = Wordmark.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Välj en ordmall och ge designen ett namn." }, { status: 400 });
    const template = await findTemplate(parsed.data.template);
    if (!template) return Response.json({ error: "Ordmallen finns inte." }, { status: 404 });
    // En mall som Craft själv importerat delas, så att klubbarnas shoppar och tryckeriet kan rita den.
    if (template.source !== "inbyggd") await publishTemplates([template.id]);
    const design = await insertDesign({ name: parsed.data.name, source: { type: "ordmall", template: template.id } });
    return Response.json({ design: view(design) });
  } catch (e) {
    if (e instanceof TemplateTaken) return Response.json({ error: e.message }, { status: 409 });
    console.error("craft/designs", e instanceof Error ? e.message : e);
    return Response.json({ error: "Kunde inte spara designen." }, { status: 500 });
  }
}
