import type { BoothFormat, BoothItem } from "./demoCatalog";
import type { EventId } from "./demoEvents";

/** Art direction for one event from the site analysis; every field is already cleaned and short. */
export type EventDirection = { theme: string; screen: string; set: string; people: string; mood: string; merch: string[] };

type Rect = { left: number; top: number; width: number; height: number };
type Range = [number, number];

export type Scene = {
  /** Neutral "DIN LOGO" references, a 3:2 image and a square one whose middle band is the 4:3 image. */
  reference: Record<BoothFormat, string>;
  /** "a trade show booth" – used in the prompt and by the reviewer. */
  subject: string;
  intro: string;
  /** Fixed left-to-right composition; `at` turns 3:2 percentages into the current format's. */
  layout: (at: (r: Range) => string) => string;
  people: string;
  colours: string;
  productsGo: string;
  expected: [BoothItem | null, string][];
  missing: Partial<Record<BoothItem, string>>;
  /** Where the people are in the 3:2 image, for the reviewer's close-up. */
  closeUp: Rect;
  reviewPeople: string;
  framing43: string;
  content: (d: EventDirection | null) => string[];
  /** Used for the reviewer: the line printed under the logo, if any. */
  printedTheme: boolean;
};

/** The 4:3 image is the 3:2 one scaled to 944 px at x 40, y 198 of a 1024 square, cut from y 112 to 880. */
const to43x = (x: number) => Math.round(3.906 + 0.9219 * x);
export const rangeText = (f: BoothFormat) => ([a, b]: Range) => (f === "4:3" ? `${to43x(a)}-${to43x(b)}%` : `${a}-${b}%`);
export const closeUpFor = (r: Rect, f: BoothFormat): Rect =>
  f === "4:3" ? { left: (40 + r.left * 944) / 1024, top: (86 + r.top * 629) / 768, width: (r.width * 944) / 1024, height: (r.height * 629) / 768 } : r;

const HANDS = "Each person has an anatomically correct body: one head, two arms, two hands, five fingers per hand, all clearly connected to their own body. No extra, missing, merged or disembodied arms, hands or fingers, and no hands reaching in from outside.";
const line = (label: string, v?: string) => (v ? `- ${label}: ${v}` : "");

export const SCENES: Record<Exclude<EventId, "massa">, Scene> = {
  konferens: {
    reference: { "3:2": "scene-konferens.jpg", "4:3": "scene-konferens-43-sq.jpg" },
    subject: "a branded corporate conference stage and registration area",
    intro: "Eye-level, straight-on wide photo inside a modern conference venue just before the first session starts: the stage at the back of the room and the registration desk in front, warm and professional event lighting.",
    layout: (at) => `Fixed composition, left to right, exactly as in the first reference image:
- FOREGROUND FAR LEFT (about ${at([3, 13])} from the left edge): a roll-up banner standing on the carpet.
- FOREGROUND LEFT (about ${at([15, 22])}): a free-standing A1 floor sign on a slim stand with the logo and a simple arrow.
- BACKGROUND, across the room (about ${at([24, 97])}): a low black stage with a wide stage backdrop wall behind it. The large logo is on the left part of the backdrop; a large 16:9 screen on the right part of the backdrop shows one clean presentation slide. On the stage, left of centre (about ${at([31, 39])}), an unattended lectern with the logo on its front panel. Nobody is on the stage.
- FOREGROUND RIGHT (about ${at([52, 92])}, lower half of the image): a long registration desk with the logo on its front panel. On the desk, neatly in rows: name badges on lanyards, a small tablet check-in stand, a few notebooks and water bottles. Two friendly staff stand behind the desk, relaxed and facing the camera, each with both hands resting on the desk top.
Open carpet floor between the desk and the stage. Upholstered chairs are not visible.`,
    people: `- Exactly two people, both behind the registration desk; nobody on the stage, nobody else in the room except a few blurred attendees far in the background. ${HANDS} Nobody else touches the desk.`,
    colours: "the stage backdrop, roll-up, floor sign, lectern front, registration desk front and the staff's clothing",
    productsGo: "on the registration desk and on the slide on the stage screen",
    expected: [
      ["rollup", "a roll-up banner far left"],
      ["skylt", "a floor sign with the logo"],
      ["scenvagg", "a stage backdrop with the logo and a big screen"],
      ["podium", "a lectern on the stage"],
      [null, "a registration desk on the right with two staff behind it"],
    ],
    missing: {
      scenvagg: "The stage backdrop is a plain dark grey wall without logo or print; the screen stays.",
      podium: "There is no lectern; the stage is empty.",
      regdisk: "The registration desk front is plain white without logo or print.",
      rollup: "There is no roll-up banner; leave that floor space empty.",
      skylt: "There is no floor sign; leave that floor space empty.",
    },
    closeUp: { left: 0.5, top: 0.28, width: 0.44, height: 0.64 },
    reviewPeople: "exactly two staff members behind the registration desk and nobody on the stage",
    framing43:
      "square frame. Keep the framing of the first reference image exactly: the whole scene fits horizontally with small margins at both sides (the roll-up and the end of the desk are never cut off), with more of the venue ceiling above and carpet below",
    content: (d) => [
      `- Stage backdrop: the logo on its left part${d?.theme ? `, and below it the conference title "${d.theme}" in clean, well-spaced type (this is the only other text allowed)` : ", no other text"}.`,
      line("Slide on the big screen (imagery only, at most the logo, no small text)", d?.screen),
      line("Registration desk", d?.set),
      line("Staff clothing and styling (two people; keep the relaxed pose described above)", d?.people),
      line("Venue, materials and lighting", d?.mood),
    ],
    printedTheme: true,
  },
  kickoff: {
    reference: { "3:2": "scene-kickoff.jpg", "4:3": "scene-kickoff-43-sq.jpg" },
    subject: "a branded company kick-off",
    intro: "Eye-level, straight-on wide photo inside a bright, modern event venue (a Scandinavian loft with large windows, light wood floor and white walls) during a company kick-off, soft natural daylight.",
    layout: (at) => `Fixed composition, left to right, exactly as in the first reference image:
- FAR LEFT (about ${at([3, 10])} from the left edge): a tall curved beach flag on a pole.
- LEFT FOREGROUND (about ${at([11, 30])}): a round table with a fitted printed tablecloth that shows the logo on its front; on it branded water bottles and two caps. Two chairs at the table, each with a branded welcome tote bag on the seat.
- BACKGROUND CENTRE (about ${at([24, 76])}): a wide banner wall (textile backdrop on an aluminium frame) with the large logo centred at the top.
- CENTRE (about ${at([33, 67])}), in front of the banner wall: a team of exactly six colleagues in matching branded hoodies, standing side by side on the floor and seen from head to shoes. The two in the middle give each other one simple high-five with their raised right hands; the other four stand relaxed with their arms at their sides or their hands in their hoodie pockets. Everyone smiles naturally.
- RIGHT FOREGROUND (about ${at([68, 87])}): a second identical round table with a printed tablecloth; on it branded thermos mugs and a branded backpack. Two chairs with welcome tote bags on the seats.
- FAR RIGHT (about ${at([89, 97])}): a welcome sign on a wooden easel with the logo.`,
    people: `- Exactly six adults, a natural mix of women and men of different ages, all in the centre group; no other people anywhere. Natural adult proportions: heads in proportion to the bodies, no oversized or tiny heads, no stretched or shortened limbs, everyone standing on the same floor plane at the same scale.
- ${HANDS} Exactly two hands meet in the high-five, palms flat and touching cleanly, each attached to its own raised arm. Nobody puts an arm around anyone, nobody holds anything.
- Faces are natural, relaxed and happy with real skin texture and symmetric eyes; no distorted, duplicated or blurred faces.`,
    colours: "the banner wall, the tablecloths, the beach flag and the team's hoodies",
    productsGo: "on the two round tables",
    expected: [
      ["beachflagga", "a beach flag far left"],
      [null, "a round table with a tablecloth on the left"],
      ["bannervagg", "a banner wall with the logo"],
      [null, "a group of exactly six colleagues in matching hoodies in the centre, two of them doing a high-five"],
      [null, "a round table with a tablecloth on the right"],
      ["valkomstskylt", "a welcome sign on an easel far right"],
    ],
    missing: {
      bannervagg: "The wall behind the team is a plain white wall without banner, logo or text.",
      bordsduk: "The round tables have plain white tablecloths without logo.",
      beachflagga: "There is no beach flag; leave that space empty.",
      valkomstskylt: "There is no welcome sign or easel; leave that space empty.",
    },
    closeUp: { left: 0.28, top: 0.12, width: 0.44, height: 0.84 },
    reviewPeople:
      "exactly six colleagues in the centre, the two in the middle doing a high-five with exactly two hands touching; check proportions (no oversized heads, stretched or missing limbs) and that every face is natural and undistorted",
    framing43:
      "square frame. Keep the framing of the first reference image exactly: the whole scene fits horizontally with small margins at both sides (the beach flag and the easel are never cut off), with more of the venue ceiling above and wood floor below",
    content: (d) => [
      `- Banner wall: the logo centred at the top${d?.theme ? `, and below it the kick-off theme "${d.theme}" in big, clean type (this is the only other text allowed)` : ", no other text"}.`,
      line("Banner wall imagery behind the logo", d?.screen),
      line("Team clothing (six people; keep the poses described above)", d?.people),
      line("On the tables", d?.set),
      line("Venue and light", d?.mood),
    ],
    printedTheme: true,
  },
  event: {
    reference: { "3:2": "scene-event.jpg", "4:3": "scene-event-43-sq.jpg" },
    subject: "a branded evening brand event with a photo wall and a bar",
    intro: "Eye-level, straight-on wide photo of an elegant evening brand event in a stylish venue with dark walls, warm string lights across the ceiling and soft bokeh in the background.",
    layout: (at) => `Fixed composition, left to right, exactly as in the first reference image:
- FAR LEFT (about ${at([3, 10])} from the left edge): a tall curved beach flag on a pole.
- LEFT (about ${at([11, 17])}): a free-standing A1 floor sign on a slim stand with the logo.
- LEFT OF CENTRE (about ${at([19, 45])}): a step-and-repeat photo wall: a light backdrop with the logo repeated in a regular grid, a short dark carpet in front of it, nobody posing.
- CENTRE FOREGROUND (about ${at([45, 58])}): a high cocktail table with a fitted stretch cover that shows the logo on its front; on it a few glasses and napkins. Exactly three guests in smart evening wear stand around it, chatting; each holds at most one glass in one hand, the other arm relaxed at the side.
- RIGHT (about ${at([60, 96])}): a bar counter with the logo on its front panel and a back bar with shelves of glasses and bottles without readable labels. Exactly two bartenders in black shirts stand behind the bar, relaxed and facing the camera, each with both hands resting on the bar or one hand holding a single glass. On the bar: engraved glasses and stacks of printed napkins.`,
    people: `- Exactly five people: two bartenders behind the bar and three guests at the cocktail table; nobody else except a few blurred silhouettes far in the background. ${HANDS} Glasses are held naturally by one hand, never floating.
- Faces are natural and relaxed with real skin texture; no distorted or duplicated faces.`,
    colours: "the bar front, the cocktail table cover, the beach flag, the floor sign and accents on the photo wall; the warm evening light stays",
    productsGo: "on the bar and the back bar shelves",
    expected: [
      ["beachflagga", "a beach flag far left"],
      ["skylt", "a floor sign with the logo"],
      ["fotovagg", "a photo wall with the logo repeated in a grid"],
      [null, "a cocktail table in the centre with three guests"],
      [null, "a bar on the right with two bartenders behind it"],
    ],
    missing: {
      fotovagg: "There is no photo wall; that part of the room is a plain dark venue wall.",
      bardisk: "The bar counter front is plain dark wood without logo.",
      cocktailbord: "The cocktail table has a plain black cover without logo.",
      beachflagga: "There is no beach flag; leave that space empty.",
      skylt: "There is no floor sign; leave that floor space empty.",
    },
    closeUp: { left: 0.42, top: 0.2, width: 0.56, height: 0.72 },
    reviewPeople: "exactly two bartenders behind the bar and exactly three guests at the cocktail table",
    framing43:
      "square frame. Keep the framing of the first reference image exactly: the whole scene fits horizontally with small margins at both sides (the beach flag and the end of the bar are never cut off), with more of the ceiling with string lights above and floor below",
    content: (d) => [
      `- Photo wall: the logo repeated in a regular grid, no other text${d?.screen ? `; ${d.screen}` : ""}.`,
      line("Bar, drinks and back bar", d?.set),
      line("Clothing of the bartenders and guests (keep the counts and poses described above)", d?.people),
      line("Mood, decor and light", d?.mood),
    ],
    printedTheme: false,
  },
};
