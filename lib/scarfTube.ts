import { SCARF } from "./scarf";

/**
 * Oberoende kontroll av hur fram- och baksida ligger i stickfilen.
 *
 * Stickfilen (240 × 1210, en pixel per maska) viks här till den tub maskinen stickar: kolumnerna går runt cylindern,
 * raderna längs halsduken. Tuben plattas till – nål 1–120 blir ena sidan, 121–240 den andra – och varje maska får en
 * plats i rummet. Sedan läses sidorna av som en människa ser dem från tubens utsida: framsidan rakt framifrån, och
 * baksidan efter att halsduken har vänts. Räkningen går via maskans plats i rummet och delar ingen kod med
 * stickmotorns egen indexformel (`machineIndex`), så de två kontrollerar varandra.
 *
 * Det filen inte kan veta är maskinens egen konvention: om Draw Designer visar tubens utsida rättvänd eller spegelvänd.
 * Här antas rättvänd. Är den spegelvänd blir hela halsduken spegelvänd – båda sidor lika – och rättas genom att hela
 * bilden speglas. Förhållandet mellan fram- och baksida ändras inte av det.
 */

const NEEDLES = SCARF.needles;
const SIDE = SCARF.side;
const ROWS = SCARF.rows;

type Point = { x: number; y: number; z: number };

/**
 * Maskans plats på den tillplattade tuben. x går längs halsduken (maskrad), y tvärs över (uppåt), z mot betraktaren.
 * Framsidan ligger närmast betraktaren. Runt övre vikkanten fortsätter nål 121 direkt bakom nål 120, och varvet sluts
 * i nedre vikkanten, där nål 240 möter nål 1.
 */
const place = (needle: number, row: number): Point => (needle < SIDE ? { x: row, y: needle, z: 1 } : { x: row, y: NEEDLES - 1 - needle, z: -1 });

/** Halsduken vänds ett halvt varv runt sin stående axel (hålls upp och ses bakifrån) eller runt sin långsida (vänds som ett blad). */
const turns = {
  "hold-up": (p: Point): Point => ({ x: ROWS - 1 - p.x, y: p.y, z: -p.z }),
  "turn-over": (p: Point): Point => ({ x: p.x, y: SIDE - 1 - p.y, z: -p.z }),
};

/**
 * Det betraktaren ser av varje sida, som bild med x åt höger och y nedåt: `front` rakt framifrån, `back` efter vändningen.
 * Samma ordning som stickmotorns sidor (rad × 120 + maska tvärs över, uppifrån).
 */
export function tubeViews(cells: Uint8Array, backReads: "hold-up" | "turn-over") {
  const front = new Uint8Array(ROWS * SIDE).fill(255);
  const back = new Uint8Array(ROWS * SIDE).fill(255);
  for (let row = 0; row < ROWS; row++) {
    for (let needle = 0; needle < NEEDLES; needle++) {
      const at = place(needle, row);
      // Bara det som vetter mot betraktaren syns: framsidan direkt, baksidan när halsduken har vänts.
      const seen = at.z > 0 ? at : turns[backReads](at);
      (at.z > 0 ? front : back)[seen.x * SIDE + (SIDE - 1 - seen.y)] = cells[row * NEEDLES + needle];
    }
  }
  return { front, back };
}

/** Antal maskor där det betraktaren ser på tuben skiljer sig från sidorna som de är ritade. Noll betyder att filen ligger rätt. */
export function tubeMismatch(knit: { cells: Uint8Array; faces: [{ cells: Uint8Array }, { cells: Uint8Array }]; backReads: "hold-up" | "turn-over" }) {
  const seen = tubeViews(knit.cells, knit.backReads);
  let off = 0;
  for (let i = 0; i < ROWS * SIDE; i++) {
    if (seen.front[i] !== knit.faces[0].cells[i]) off++;
    if (seen.back[i] !== knit.faces[1].cells[i]) off++;
  }
  return off;
}
