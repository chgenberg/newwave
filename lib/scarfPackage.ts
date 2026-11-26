import { htmlToPdf } from "./pdf";
import { SCARF } from "./scarf";
import type { FaceKnit, Knitted } from "./scarfEngine";
import { type BackReads, FOLD_NEEDLES, finishTube } from "./scarfMachine";
import { buildPackage, inspect } from "./scarfProduction";

/**
 * Stickpaketet som stickeriet godkänt (november 2026), för halsdukar som ritats någon annanstans än i halsduksagenten –
 * den gamla halsduksstudion, hubbens leverans och kampanjpaketet. Sidorna görs färdiga för maskinen på samma sätt som i
 * agenten (enfärgade ändrader i mönstrets närmaste färg, samma färg kring vikkanterna, fransens färg), kontrolleras
 * och lämnas som samma filer: en BMP för hela halsduken, korrektur, stickorder som PDF, garnlista, stickorder som
 * data och LÄS MIG. Därmed finns bara ett sätt att göra stickfiler, hur halsduken än ritats.
 */

export type PackageFromFaces = {
  club: string;
  title: string;
  why?: string;
  /** Vad som står på fram- och baksidan, i ord, till stickordern. */
  front: string;
  back: string;
  /** De två sidorna liggande, `r * 120 + s` (se lib/scarfMachine.ts), i garnernas index. */
  faces: [Uint8Array, Uint8Array];
  palette: string[];
  /** Lägsta texthöjd i mm, när den är känd. */
  minTextMm?: number | null;
  backReads?: BackReads;
  date?: string;
};

/**
 * Minsta avståndet i mm från en långsida (vikkanten) till motivet. Halsduken är ritad utan uppgift om var text och
 * märken ligger, så det mäts i mönstret: på varje varv som inte är enfärgat, från kanten till första maskan som avviker
 * från kantens färg. Enfärgade varv – ränder runt hela varvet – räknas inte.
 */
function marginMm(faces: [Uint8Array, Uint8Array]) {
  const [R, S, K] = [SCARF.rows, SCARF.side, FOLD_NEEDLES];
  let min = Infinity;
  for (const f of faces)
    for (let r = 0; r < R; r++) {
      // Vikkantens nålar har framsidans färg på båda sidor (foldBands); kantens färg läses innanför dem.
      const row = f.subarray(r * S + K, r * S + S - K);
      const [a, b] = [row[0], row[row.length - 1]];
      let first = 0;
      while (first < row.length && row[first] === a) first++;
      if (first === row.length) continue;
      let last = row.length - 1;
      while (last >= 0 && row[last] === b) last--;
      min = Math.min(min, K + first, K + row.length - 1 - last);
    }
  return Number.isFinite(min) ? (min * SCARF.widthMm) / S : null;
}

/** Sidorna som en färdig halsduk, i samma form som halsduksagentens. */
export function knittedFromFaces(faces: [Uint8Array, Uint8Array], palette: string[], opts: Pick<PackageFromFaces, "minTextMm" | "backReads"> = {}): Knitted {
  const backReads = opts.backReads ?? "hold-up";
  const done = finishTube([faces[0].slice(), faces[1].slice()], backReads);
  const blank = () => new Uint8Array(SCARF.side * SCARF.rows);
  const side = (cells: Uint8Array, fringe: [number, number]): FaceKnit => ({ cells, protect: blank(), texts: [], margins: [], fringe });
  return {
    cells: done.cells,
    protect: new Uint8Array(done.cells.length),
    palette,
    // Baksidan läses bakifrån när halsduken hålls upp, så dess första rad är fransen vid rad 1210.
    faces: [side(done.faces[0], done.fringe), side(done.faces[1], backReads === "hold-up" ? [done.fringe[1], done.fringe[0]] : done.fringe)],
    minTextMm: opts.minTextMm ?? null,
    minMarginMm: marginMm(done.faces),
    backReads,
    fringe: done.fringe,
  };
}

/** Paketet och halsduken som den blir stickad (maskinens rutnät, garnerna, fransen). */
export async function packageFromFaces(input: PackageFromFaces) {
  const knit = knittedFromFaces(input.faces, input.palette, input);
  const pack = await buildPackage({
    club: input.club,
    title: input.title,
    why: input.why,
    front: input.front,
    back: input.back,
    consent: null,
    knit,
    report: inspect(knit),
    date: input.date ?? new Date().toISOString().slice(0, 10),
    pdf: htmlToPdf,
  });
  return { ...pack, knit };
}

/** Halsduken ritad som i halsduksstudion: sidorna bredvid varandra, kolumn 1–120 framsidan och 121–240 baksidan. */
export function facesFromDrawn(drawn: Uint8Array): [Uint8Array, Uint8Array] {
  const [R, S, N] = [SCARF.rows, SCARF.side, SCARF.needles];
  const faces: [Uint8Array, Uint8Array] = [new Uint8Array(S * R), new Uint8Array(S * R)];
  faces.forEach((f, side) => {
    for (let r = 0; r < R; r++) f.set(drawn.subarray(r * N + side * S, r * N + side * S + S), r * S);
  });
  return faces;
}
