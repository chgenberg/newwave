import { cachedImage, designById, pocClub, scarfIdea, scarfKey, scarfPreview, scarfSpecFor, type ScarfSpec, variantFromQuery } from "@/lib/poc/build";
import type { Design } from "@/lib/poc/types";

export const maxDuration = 60;

const SIZES = new Set([480, 800]);
const TEMPLATE = /^[a-z0-9-]{2,40}$/;

/**
 * Förhandsbilden av klubbens stickade halsduk: samma mönster som stickfilen, ritad en gång och sparad. Med `t=` bär
 * halsduken ordmallen (med `m` och `u` i en variants texter), med `d=` den uppladdade designen som motiv; utan dem den
 * klassiska klubbhalsduken.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const size = Number(q.get("s") ?? 800);
  const [t, d] = [q.get("t"), q.get("d")];
  const club = await pocClub(q.get("c") ?? "");
  if (!club || !SIZES.has(size) || (t && !TEMPLATE.test(t))) return new Response("Hittades inte", { status: 404 });
  try {
    const design: Design | null = t
      ? { id: "forhandsvisning", name: "Förhandsvisning", source: { type: "ordmall", template: t }, createdAt: new Date(0).toISOString() }
      : d
        ? await designById(d).catch(() => null)
        : null;
    if (d && !design) return new Response("Hittades inte", { status: 404 });
    const spec: ScarfSpec = design
      ? await scarfSpecFor(design, club, undefined, t ? variantFromQuery(q) : undefined)
      : { v: 1, kind: "halsduk", club, knitRef: club.registry ? `reg:${club.id}` : club.id, yarns: club.colors, idea: scarfIdea(club), design: { id: "", name: "" } };
    const jpg = await cachedImage(["halsduk", ...scarfKey(spec), club.logo, size], () => scarfPreview(spec, size));
    if (!jpg) return new Response("Hittades inte", { status: 404 });
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" } });
  } catch (e) {
    console.error("craft/halsduk", club.id, e instanceof Error ? e.message : e);
    return new Response("Kunde inte rita halsduken", { status: 500 });
  }
}
