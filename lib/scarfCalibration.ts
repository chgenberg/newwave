import { SCARF } from "./scarf";
import type { Content, ScarfDesign, Section } from "./scarfDesign";
import { knitDesign } from "./scarfEngine";
import { inspect } from "./scarfProduction";

/**
 * Kalibreringshalsduken: en halsduk som stickas en gång och visar hur maskinen och mönsterprogrammet vänder våra filer.
 * Det filen inte kan veta – om programmet visar tubens utsida rättvänd eller spegelvänd, var tuben viks och åt vilket
 * håll beställaren vill läsa baksidan – syns direkt på den stickade halsduken: den ena änden är röd och märkt A på
 * båda sidor, den andra svart och märkt B, och sidorna säger själva vilka de är.
 */

const [WHITE, BLACK, RED] = [0, 1, 2];
const solid = (yarn: number) => ({ kind: "solid" as const, yarn });
const text = (...lines: string[]): Content => ({ kind: "text", lines, font: "block", yarn: BLACK, sub: 0.3 });
const bar = (yarn: number): Section => ({ mm: 70, fill: solid(yarn) });
const label = (letter: string, row: string): Section => ({ mm: 260, fill: solid(WHITE), content: text(letter, row), pad: [20, 22] });
const side = (name: string, needles: string): Section => ({ fill: solid(WHITE), content: text(name, needles), pad: [30, 22] });

/** Ände A är där maskinen börjar sticka (rad 1), ände B där den slutar. Sedd bakifrån ligger B till vänster. */
const DESIGN: ScarfDesign = {
  palette: ["#FFFFFF", "#0A0A0A", "#D0202A"],
  front: { sections: [bar(RED), label("A", "RAD 1"), side("FRAMSIDA", `NÅL 1 TILL ${SCARF.side}`), label("B", `RAD ${SCARF.rows}`), bar(BLACK)] },
  back: { sections: [bar(BLACK), label("B", `RAD ${SCARF.rows}`), side("BAKSIDA", `NÅL ${SCARF.side + 1} TILL ${SCARF.needles}`), label("A", "RAD 1"), bar(RED)] },
  backReads: "hold-up",
};

export const CALIBRATION = {
  club: "Kalibrering",
  title: "Kalibreringshalsduk",
  why: "Stickas en gång. Visar hur maskinen och mönsterprogrammet vänder filerna, så att alla kommande halsdukar blir rätt.",
  file: "KALIBRERING.txt",
  guide: [
    "KALIBRERINGSHALSDUK",
    "",
    "Stickas en gång. Den visar hur maskinen och Draw Designer vänder våra filer, så att alla kommande halsdukar blir rätt.",
    "Den använder tre garner: vitt, svart och rött.",
    "",
    "Så ska den se ut när den är stickad",
    "  Framsidan: röd ände till vänster, sedan A, FRAMSIDA, B och svart ände till höger. Texten läses rätt.",
    "  Håll upp halsduken och se den bakifrån: BAKSIDA läses rätt, med B och den svarta änden till vänster.",
    "  Samma ände är röd och märkt A på båda sidor. Den andra är svart och märkt B på båda sidor.",
    "  A är den ände maskinen stickar först (rad 1).",
    "",
    "Om något avviker",
    "  1. Texten är spegelvänd på båda sidor.",
    "     Programmet visar tuben från andra hållet. Spegla hela bilden vågrätt i Draw Designer – eller säg till, så speglar vi alla filer.",
    "  2. Text eller ändfält går runt kanten, så att fram- och baksida är förskjutna.",
    `     Tuben viks på ett annat ställe än mellan nål ${SCARF.needles} och 1 och mellan nål ${SCARF.side} och ${SCARF.side + 1}. Säg vilken nål som ligger i vikkanten, så flyttar vi mönstret.`,
    "  3. Baksidan läses rätt bakifrån, men ni vill hellre att den läses rätt när halsduken vänds över långsidan.",
    "     Säg till – det är ett val i exporten, och gäller sedan alla halsdukar.",
    "  4. A står på den ände som stickas sist.",
    "     Programmet läser bilden nerifrån och upp. Det påverkar inte utseendet, men säg till så att stickordern stämmer.",
    "  5. Något annat.",
    "     Skicka ett foto av båda sidor, så rättar vi exporten.",
    "",
  ].join("\r\n"),
};

export async function knitCalibration() {
  const knit = await knitDesign(DESIGN);
  return { knit, report: inspect(knit) };
}
