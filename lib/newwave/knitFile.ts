import { CLUBS } from "@/lib/club";
import { htmlToPdf } from "@/lib/pdf";
import { checkGrid } from "@/lib/scarf";
import { knitIdea } from "@/lib/scarfFlow";
import { buildPackage } from "@/lib/scarfProduction";
import type { ScarfIdea } from "@/lib/scarfRecipes";

/**
 * Stickfilerna till en jacquardhalsduk i hubbens leverans. Halsduken ritas av halsduksagentens motor (det klassiska
 * receptet: ränder i ändarna, klubbens märke och en text per sida) och lämnas som exakt det paket stickeriet godkänt:
 * en BMP för hela halsduken, korrektur, stickorder som PDF, garnlista, stickorder som data och LÄS MIG.
 */

export type KnitInput = { clubId: string; front: string; back: string; yarns: string[]; date: string };
export type KnitFile = { name: string; data: Buffer };
export type Knit = { palette: string[]; counts: number[]; minTextMm: number; files: KnitFile[]; preview: string };

export async function knitScarf(input: KnitInput): Promise<Knit> {
  const club = CLUBS[input.clubId];
  if (!club) throw new Error(`Klubben ${input.clubId} finns inte`);
  const [ground, ink, accent] = [input.yarns[0], input.yarns[1] ?? "#FFFFFF", input.yarns[2] ?? input.yarns[1] ?? "#FFFFFF"];
  const idea: ScarfIdea = {
    id: `hubb-${club.id}`,
    title: "Klubbhalsduk",
    why: "Klassisk klubbhalsduk i klubbens garner, godkänd av klubben i hubben.",
    signal: "",
    recipe: "klassisk",
    front: { main: input.front, sub: "" },
    back: { main: input.back, sub: "" },
    font: "anton",
    colors: { ground, ink, accent },
    icon: null,
    art: null,
    number: "",
    roster: [],
  };
  const r = await knitIdea(club, idea);
  const pack = await buildPackage({ club: club.name, title: idea.title, why: idea.why, front: r.front, back: r.back, consent: r.built.consent, knit: r.knit, report: r.report, date: input.date, pdf: htmlToPdf });
  const { counts } = checkGrid(r.knit.cells, r.knit.palette, r.knit.minTextMm);
  return {
    palette: r.knit.palette,
    counts,
    minTextMm: r.knit.minTextMm ?? 0,
    files: pack.files.map((f) => ({ name: f.name, data: f.data })),
    preview: pack.files.find((f) => f.name.endsWith("-korrektur.png"))!.name,
  };
}
