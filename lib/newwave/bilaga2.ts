/**
 * Tryckytorna i New Wave Groups Gräsrot 360 – Bilaga 2: var på produkterna det får tryckas och med vilka tekniker.
 * Allt som placerar tryck på kläder – designstudion, klubbshopen, ordmärkena och Gräsrot 360 – läser ytorna härifrån.
 *
 * Bilagan ritar ytorna men anger inga mått. Måtten är uppmätta på bilagans vektorrutor och skalade mot plaggen i
 * storlek M (New Wave Groups måttabeller: T-shirt 3410020 58 cm halv bröstvidd, hoodie 3440020 64 cm) och mot flaskans
 * 72 mm diameter, avrundade nedåt till hela cm. Kepsen är ritad i perspektiv; där gäller brodyrens standardyta.
 */

export type Technique = "screentryck" | "transfer" | "brodyr" | "digitaltryck" | "lasergravyr" | "vavt";
export type Bilaga2Product = "tshirt" | "hoodie" | "keps" | "flaska" | "halsduk";
type Vec3 = [number, number, number];

export type Bilaga2Zone = {
  id: string;
  label: string;
  /** Största motivet som ryms i ytan, i mm. */
  widthMm: number;
  heightMm: number;
  techniques: Technique[];
  /** Var ytan sitter på 3D-modellen: riktning mot kameran och förskjutning i andelar av modellens storlek. */
  dir: Vec3;
  offset: [number, number];
  /** Tryckets bredd när ytan väljs i studion, i cm; saknas = trycket behåller sin bredd. */
  startCm?: number;
};

const zone = (id: string, label: string, [widthMm, heightMm]: [number, number], techniques: Technique[], dir: Vec3, offset: [number, number], startCm?: number): Bilaga2Zone => ({
  id,
  label,
  widthMm,
  heightMm,
  techniques,
  dir,
  offset,
  startCm,
});

const SCREEN: Technique[] = ["screentryck", "transfer"];
const TEXTILE: Technique[] = ["screentryck", "transfer", "brodyr"];
const FRONT: Vec3 = [0, 0, 1];
const BACK: Vec3 = [0, 0, -1];
// Bärarens vänstra sida är +X: modellerna har framsidan mot +Z.
const LEFT: Vec3 = [1, 0, 0];
const RIGHT: Vec3 = [-1, 0, 0];

export const BILAGA2: Record<Bilaga2Product, Bilaga2Zone[]> = {
  tshirt: [
    zone("brost", "Bröstet", [420, 350], SCREEN, FRONT, [0, 0.18]),
    zone("vanster", "Vänster bröst", [130, 120], ["brodyr"], FRONT, [0.12, 0.22], 9),
    zone("hoger", "Höger bröst", [130, 120], ["brodyr"], FRONT, [-0.12, 0.22], 9),
    zone("arm", "Vänster ärm", [150, 150], TEXTILE, LEFT, [0, 0.25], 8),
    zone("arm-hoger", "Höger ärm", [150, 150], TEXTILE, RIGHT, [0, 0.25], 8),
    zone("rygg", "Ryggen", [420, 450], SCREEN, BACK, [0, 0.15]),
    zone("nacke", "Nacken", [130, 30], ["brodyr"], BACK, [0, 0.4], 7),
  ],
  hoodie: [
    zone("brost", "Bröstet", [430, 360], SCREEN, FRONT, [0, 0.18]),
    zone("vanster", "Vänster bröst", [140, 130], ["brodyr"], FRONT, [0.12, 0.22], 9),
    zone("hoger", "Höger bröst", [140, 130], ["brodyr"], FRONT, [-0.12, 0.22], 9),
    zone("arm", "Vänster ärm", [160, 160], TEXTILE, LEFT, [0, 0.25], 8),
    zone("arm-hoger", "Höger ärm", [160, 160], TEXTILE, RIGHT, [0, 0.25], 8),
    zone("rygg", "Ryggen", [430, 460], SCREEN, BACK, [0, 0.15]),
  ],
  keps: [zone("front", "Framsidan", [100, 60], ["brodyr"], FRONT, [0, 0.12])],
  flaska: [zone("front", "Framsidan", [48, 118], ["digitaltryck", "lasergravyr"], FRONT, [0, 0])],
  halsduk: [zone("hel", "Hela halsduken", [1100, 150], ["vavt"], FRONT, [0, 0])],
};
