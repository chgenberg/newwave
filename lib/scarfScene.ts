/**
 * Var och när halsduken fotograferas. Platsen följer sporten (ishall för hockey, idrottshall för handboll och innebandy,
 * fotbollsplan för fotboll) och ljuset, marken och kläderna följer årstiden, så att bilderna ser ut att vara tagna hos
 * klubben den här veckan. Texterna är på engelska, eftersom bildmodellen beställs på engelska.
 */

export type Season = "vinter" | "vår" | "sommar" | "höst";
/** Var i anläggningen fotot tas: vid ingången, där publiken står, eller på en öppen yta intill spelplanen. */
export type Spot = "entrance" | "stand" | "open";
type Air = "ute" | "hall" | "ishall";

/** Årstiden i Sverige för ett datum. `winter` tvingar fram vinter – en julhalsduk fotograferas inte i sommargrönska. */
export function seasonOf(date = new Date(), winter = false): Season {
  if (winter) return "vinter";
  const month = date.getUTCMonth();
  return month === 11 || month <= 1 ? "vinter" : month <= 4 ? "vår" : month <= 7 ? "sommar" : "höst";
}

const NATURE: Record<Season, string> = {
  vinter: "It is winter in Sweden: cold air, bare trees, and patches of snow and ice on the ground.",
  vår: "It is early spring in Sweden: bare branches with the first buds and dry ground with leftover winter grit.",
  sommar: "It is summer in Sweden: leafy green trees, green grass and people in light clothes.",
  höst: "It is autumn in Sweden: wet ground and yellow leaves lying about.",
};
const DAYLIGHT: Record<Season, string> = {
  vinter: "Flat grey winter daylight.",
  vår: "Pale spring sunshine.",
  sommar: "Bright, plain summer daylight.",
  höst: "Overcast grey daylight.",
};
const EVENING: Record<Season, string> = {
  vinter: "It is early evening, already dark, and ordinary outdoor lamps are lit.",
  vår: "It is early evening at dusk, and ordinary outdoor lamps have just come on.",
  sommar: "It is a light summer evening with the sun low and no lamps lit.",
  höst: "It is early evening at dusk, and ordinary outdoor lamps are lit.",
};

/** Det som syns av årstiden utomhus: naturen och ljuset. */
export const outdoors = (season: Season, evening = false) => `${NATURE[season]} ${evening ? EVENING[season] : DAYLIGHT[season]}`;

type Place = Record<Spot, string> & {
  /** Var läktaren och den öppna ytan ligger. Ingången är alltid ute. */
  air: Air;
  /** En plats som bara finns en årstid – skidspår och bandyis fotograferas alltid i vinter. */
  always?: Season;
};

const PLACES = {
  plan: {
    entrance: "standing outside the entrance of a small local Swedish football ground before a match, with the clubhouse, a bicycle rack and a few other supporters behind",
    stand: "standing in the small stand of a local Swedish football ground before kick-off, with the pitch and a few other supporters behind",
    open: "standing by the touchline fence of a local Swedish football pitch before a match, with the pitch, a goal and the clubhouse behind",
    air: "ute",
  },
  hall: {
    entrance: "standing outside the entrance of a local Swedish sports hall before a match, with the car park, a bicycle rack and a few other spectators behind",
    stand: "standing in the pull-out stand inside a local Swedish sports hall before a match, with the court and a few other spectators behind, in ordinary fluorescent hall lighting",
    open: "standing at the edge of the court inside a local Swedish sports hall, with the wooden floor with coloured court lines, wall bars and a small pull-out stand behind, in ordinary fluorescent hall lighting",
    air: "hall",
  },
  ishall: {
    entrance: "standing outside the entrance of a local Swedish ice rink before a match, with the car park and a few other supporters behind",
    stand: "standing in the stand inside a local Swedish ice rink before a match, with the ice, the boards and the plexiglass behind, in ordinary cold arena lighting",
    open: "standing on the walkway behind the boards inside a local Swedish ice rink, with the empty ice, the boards and the plexiglass behind, in ordinary cold arena lighting",
    air: "ishall",
  },
  bandy: {
    entrance: "standing outside the entrance of a local Swedish bandy arena before a match, with the car park and a few other supporters behind",
    stand: "standing in the open-air stand of a local Swedish bandy arena before a match, with the large outdoor ice sheet and the floodlight masts behind",
    open: "standing beside the snow bank at the edge of the large outdoor ice sheet of a local Swedish bandy arena, with the ice and a small stand behind",
    air: "ute",
    always: "vinter",
  },
  bana: {
    entrance: "standing outside the gate of a local Swedish athletics ground on a competition day, with a bicycle rack and a few other club members behind",
    stand: "standing in the small stand of a local Swedish athletics ground on a competition day, with the running track behind",
    open: "standing on the grass beside the running track of a local Swedish athletics ground, with the track lanes and a small stand behind",
    air: "ute",
  },
  stall: {
    entrance: "standing outside the stable of a local Swedish riding club, with the stable doors and a paddock fence behind",
    stand: "standing by the rail of the outdoor riding arena of a local Swedish riding club, with a few show jumps and a paddock behind",
    open: "standing on the gravel yard of a local Swedish riding club, with the stable building and a paddock fence behind",
    air: "ute",
  },
  skog: {
    entrance: "standing at the edge of a forest car park on the day of a Swedish orienteering event, with pine forest and a few other runners behind",
    stand: "standing in a forest clearing on the day of a Swedish orienteering event, with pine trees and a few small club tents behind",
    open: "standing in an open forest clearing on the day of a Swedish orienteering event, with pine trees and a few small club tents behind",
    air: "ute",
  },
  spår: {
    entrance: "standing outside the clubhouse at a local Swedish ski stadium, with deep snow, a ski rack and a few other skiers behind",
    stand: "standing in the snow at the finish area of a local Swedish ski stadium, with groomed tracks and spruce forest behind",
    open: "standing in the snow beside the groomed cross-country tracks at a local Swedish ski stadium, with spruce forest behind",
    air: "ute",
    always: "vinter",
  },
  golf: {
    entrance: "standing outside the clubhouse of a local Swedish golf club, with a few golf trolleys and the car park behind",
    stand: "standing on the clubhouse terrace of a local Swedish golf club, with the eighteenth green behind",
    open: "standing beside the first tee of a local Swedish golf course, with the fairway and the clubhouse behind",
    air: "ute",
  },
  tennis: {
    entrance: "standing outside the clubhouse of a local Swedish tennis club, with a bicycle rack and a few other members behind",
    stand: "standing by the fence of the outdoor courts of a local Swedish tennis club, with the nets and the clubhouse behind",
    open: "standing beside the outdoor courts of a local Swedish tennis club, with the nets, the fence and the clubhouse behind",
    air: "ute",
  },
  simhall: {
    entrance: "standing outside the entrance of a local Swedish public swimming hall, with a bicycle rack and a few other visitors behind",
    stand: "standing in the spectator gallery of a local Swedish swimming hall, with the pool and the lane ropes behind, in ordinary indoor lighting",
    open: "standing in the foyer of a local Swedish swimming hall, with the pool visible through a large window behind, in ordinary indoor lighting",
    air: "hall",
  },
  bowling: {
    entrance: "standing outside the entrance of a local Swedish bowling alley, with the car park and a few other players behind",
    stand: "standing behind the lanes inside a local Swedish bowling alley, with the lanes and the ball returns behind, in ordinary indoor lighting",
    open: "standing behind the lanes inside a local Swedish bowling alley, with the lanes and the ball returns behind, in ordinary indoor lighting",
    air: "hall",
  },
  motor: {
    entrance: "standing in the paddock of a local Swedish motor sport track on a race day, with a few parked vans and trailers behind",
    stand: "standing on the spectator bank of a local Swedish motor sport track on a race day, with the track and the tyre barriers behind",
    open: "standing by the fence of a local Swedish motor sport track, with the track and the tyre barriers behind",
    air: "ute",
  },
  vatten: {
    entrance: "standing outside the boathouse of a local Swedish boat club, with a few boats on trailers behind",
    stand: "standing on the jetty of a local Swedish boat club, with the water and a few moored boats behind",
    open: "standing on the jetty by the boathouse of a local Swedish boat club, with the water and a few moored boats behind",
    air: "ute",
  },
  /** Sporter utan egen plats, och klubbar där sporten inte är känd. */
  klubb: {
    entrance: "standing outside the clubhouse of a local Swedish sports club, with a bicycle rack and a few other club members behind",
    stand: "standing in the small stand of a local Swedish sports ground, with the field and a few other club members behind",
    open: "standing on the gravel outside the clubhouse of a local Swedish sports ground, with the field and a fence behind",
    air: "ute",
  },
  /** Företag och föreningar utanför idrotten. */
  vardag: {
    entrance: "standing on an ordinary Swedish town street, with shop fronts, parked bicycles and a few passers-by behind",
    stand: "standing outside the entrance of an ordinary Swedish workplace, with a brick wall and a few parked cars behind",
    open: "standing in the car park outside an ordinary Swedish workplace, with a brick wall and a few parked cars behind",
    air: "ute",
  },
} satisfies Record<string, Place>;

type PlaceId = keyof typeof PLACES;

/** Sporten avgör platsen. Ordningen spelar roll: "innebandy" ska inte bli bandy, och "bordtennis" inte tennis. */
const BY_SPORT: [RegExp, PlaceId][] = [
  [/innebandy|handboll|basket|voll?e?yboll|badminton|bordtennis|gymnastik|brottning|boxning|budo|judo|karate|taekwondo|fäktning|styrkelyft|tyngdlyft|dans|cheer|squash|handikapp|futsal/, "hall"],
  [/bowling|biljard/, "bowling"],
  [/simning|sportdykning/, "simhall"],
  [/bandy/, "bandy"],
  [/ishockey|konståkning|curling|skridsko/, "ishall"],
  [/fotboll|rugby|landhockey|baseboll|frisbee/, "plan"],
  [/friidrott|gång|mångkamp|tria/, "bana"],
  [/ridsport/, "stall"],
  [/orientering/, "skog"],
  [/segling|kanot|rodd|vattenskid|racerbåt/, "vatten"],
  [/skidor|skidskytte/, "spår"],
  [/bangolf/, "klubb"],
  [/golf/, "golf"],
  [/tennis/, "tennis"],
  [/motor|bilsport/, "motor"],
];

export function placeOf(sport: string | null | undefined, everyday = false): PlaceId {
  if (everyday) return "vardag";
  const name = (sport ?? "").toLocaleLowerCase("sv-SE");
  return BY_SPORT.find(([pattern]) => pattern.test(name))?.[1] ?? "klubb";
}

/** Vanliga människor i olika åldrar. Kläderna väljs för sig, efter årstid och plats. */
const FACES = [
  "a woman of about 45 with glasses and shoulder-length brown hair",
  "a man of about 55 with a greying beard",
  "a woman of about 30 with her hair in a loose ponytail",
  "a man of about 25 with short dark hair",
  "a woman of about 60 with short grey hair",
  "a man of about 40 with stubble",
];

type Wear = Season | "hall";
const CLOTHES: Record<Wear, string[]> = {
  vinter: ["a plain dark puffer jacket", "a plain dark parka", "a plain grey wool coat", "a plain black winter jacket and a plain dark beanie", "a plain navy quilted jacket", "a plain dark softshell jacket and a plain grey beanie"],
  vår: ["a plain navy windbreaker", "an open dark jacket over a plain grey hoodie", "a plain beige light jacket", "a plain black softshell jacket", "a plain dark denim jacket", "a plain green rain jacket"],
  sommar: ["a plain white t-shirt", "an open light shirt over a plain grey t-shirt", "a plain navy polo shirt", "a light denim jacket over a plain t-shirt", "a plain short-sleeved shirt", "a thin grey cardigan over a plain t-shirt"],
  höst: ["a plain dark rain jacket", "a dark puffer vest over a plain grey sweater", "a plain olive parka", "a plain black windbreaker", "a plain navy quilted jacket", "a plain dark softshell jacket"],
  hall: ["a plain grey hoodie", "a plain dark knitted sweater", "a plain navy fleece jacket", "an open dark jacket over a plain t-shirt", "a plain dark cardigan", "a plain black sweatshirt"],
};

export type Setting = {
  season: Season;
  place: PlaceId;
  /** Platsen som en bisats ("standing … behind."), med årstiden när fotot tas utomhus, och vad folk har på sig där. */
  at: (spot: Spot, evening?: boolean) => { where: string; wear: Wear };
};

/** Platsen och årstiden för en klubb. `winter` är sant för julhalsdukar. */
export function settingOf(input: { sport?: string | null; everyday?: boolean; date?: Date; winter?: boolean }): Setting {
  const place = placeOf(input.sport, input.everyday);
  const spec: Place = PLACES[place];
  const season = spec.always ?? seasonOf(input.date, input.winter);
  return {
    season,
    place,
    at: (spot, evening = false) => {
      const inside = spot !== "entrance" && spec.air !== "ute";
      // I en ishall är det kallt året om; i en idrottshall har folk tagit av sig jackan.
      return { where: `${spec[spot]}.${inside ? "" : ` ${outdoors(season, evening)}`}`, wear: inside ? (spec.air === "ishall" ? "vinter" : "hall") : season };
    },
  };
}

/** En person per bild: olika ansikten och olika kläder, varannan kvinna och varannan man. */
export function people(wear: Wear[]) {
  const [face, cloth] = [Math.floor(Math.random() * FACES.length), Math.floor(Math.random() * 6)];
  return wear.map((w, i) => `${FACES[(face + i) % FACES.length]}, in ${CLOTHES[w][(cloth + i) % CLOTHES[w].length]}`);
}
