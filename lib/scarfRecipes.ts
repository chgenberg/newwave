import { GREY_YARNS, SCARF, deltaE, hexToRgb } from "./scarf";
import { mirrored, nordicMm, type BitmapId, type Content, type Face, type Fill, type FontKey, type IconId, type NordicBand, type ScarfDesign, type Section, type SignStroke, type Stripe, type Yarn } from "./scarfDesign";
import type { Club } from "./types";

/**
 * Halsduksagentens recept. En idé väljer ett recept och fyller i text, färgroller, typsnitt och motiv;
 * receptet gör den till en design som alltid går att sticka. Agenten står för idén – måtten är fasta.
 */

export type RecipeId =
  | "klassisk"
  | "bar"
  | "retro"
  | "matchdag"
  | "jul"
  | "argyle"
  | "trupp"
  | "portratt"
  | "motiv"
  | "tapet"
  | "toning"
  | "sicksack"
  | "personlig"
  | "arena"
  | "vagor"
  | "profil"
  | "autograf";

export type Level = "enkel" | "mellan" | "komplex";

export const RECIPES: Record<RecipeId, { label: string; hint: string; level: Level }> = {
  klassisk: { label: "Klassisk", hint: "Ändränder, sköld och klubbnamn – den alla känner igen.", level: "enkel" },
  bar: { label: "Bar scarf", hint: "Breda tvärränder i två färger med skölden i mitten. Ingen text på framsidan.", level: "enkel" },
  retro: { label: "Retro", hint: "Längsränder, collegebokstäver och årtalet tvärs över ändarna.", level: "enkel" },
  personlig: { label: "Personlig", hint: "Eget namn och nummer – till spelare, ledare och julklappar.", level: "enkel" },
  profil: { label: "Profil", hint: "Diagonalränder, logga och devis – för företag och sponsorer.", level: "enkel" },
  matchdag: { label: "Matchdag", hint: "Två halvor i två toner med skölden i mitten – till derbyt eller finalen.", level: "mellan" },
  arena: { label: "Arenan", hint: "Hemmaplanen med strålkastare och rutiga ändar.", level: "mellan" },
  sicksack: { label: "Sicksack", hint: "Sjuttiotalets sicksackränder i ändarna.", level: "mellan" },
  vagor: { label: "Vågor", hint: "Mjuka vågor i ändarna – för klubbar vid kusten.", level: "mellan" },
  toning: { label: "Toning", hint: "Rastrerad övergång mellan två garner, modern och ren.", level: "mellan" },
  argyle: { label: "Argyle", hint: "Romber ton i ton med tunn korslinje.", level: "mellan" },
  tapet: { label: "Tapet", hint: "Ett litet maskmotiv upprepat över hela halsduken, texten med kontur ovanpå.", level: "komplex" },
  jul: { label: "Julhalsduk", hint: "Nordiska bårder med snöstjärnor och hjärtan i klubbens färger.", level: "komplex" },
  motiv: { label: "Motiv", hint: "Ett stort motiv i mitten – en ikon eller ett motiv som bildmodellen ritar.", level: "komplex" },
  trupp: { label: "Truppen", hint: "Spelarnas namn och nummer längs hela halsduken.", level: "komplex" },
  portratt: { label: "Porträtt", hint: "Ett foto stickat i fyra gråtoner, med namn och nummer.", level: "komplex" },
  autograf: { label: "Autografer", hint: "Spelarnas namnteckningar stickade längs halsduken, med en kort rubrik.", level: "komplex" },
};

/** Recept som bär en persons namn, nummer, ansikte eller namnteckning och därför kräver godkännande. */
export const PERSONAL: RecipeId[] = ["trupp", "portratt", "personlig", "autograf"];
/** Påhittade exempel som står på halsduken tills beställaren fyller i sina egna. */
export const SAMPLE_SIGNERS = ["Elsa Lindkvist", "Noah Berg", "Maja Holm"];
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export type ScarfIdea = {
  id: string;
  /** Kort namn på halsduken. */
  title: string;
  /** Varför den här halsduken, och varför nu. */
  why: string;
  /** Signalen idén bygger på. */
  signal: string;
  recipe: RecipeId;
  front: { main: string; sub: string };
  back: { main: string; sub: string };
  font: FontKey;
  /** Garnfärger ur klubbens profil: botten, text och detalj. */
  colors: { ground: string; ink: string; accent: string };
  icon: IconId | null;
  /** Beskrivning på engelska av ett motiv som bildmodellen ritar. Bara för receptet "motiv". */
  art: string | null;
  number: string;
  /** Truppens spelare ("7 NILSSON"), eller för receptet autograf namnen som stickas som namnteckningar. */
  roster: string[];
};

export type ScarfClub = Pick<Club, "id" | "name" | "shortName" | "palette" | "crestColors" | "founded" | "arena" | "city" | "nicknames" | "kind">;

export type Built = { design: ScarfDesign; uses: { crest: boolean; portrait: boolean; art: boolean }; /** Det som behöver klubbens eller personens godkännande. */ consent: string | null };

const up = (s: string) => s.trim().toLocaleUpperCase("sv-SE");
const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.299 + g * 0.587 + b * 0.114;
};

/** Skillnad i ljushet, 0–255. Gult mot vitt skiljer sig i färg men syns knappt i stickningen. */
const contrast = (a: string, b: string) => Math.abs(lum(a) - lum(b));

/** Garnlistan för en idé: botten, text, detalj, en ton nära botten, sköldens färger och vid porträtt fyra gråtoner. */
function yarns(club: ScarfClub, idea: ScarfIdea, opts: { crest: boolean; portrait: boolean }) {
  const palette: string[] = [];
  const add = (hex: string | undefined, min = 6) => {
    if (!hex) return -1;
    const h = hex.toUpperCase();
    const found = palette.findIndex((p) => deltaE(p, h) < min);
    if (found >= 0) return found;
    if (palette.length >= SCARF.maxColors) return -1;
    palette.push(h);
    return palette.length - 1;
  };
  const near = (hex: string) => palette.reduce((best, p, i) => (deltaE(p, hex) < deltaE(palette[best], hex) ? i : best), 0);

  const all = club.palette.map((c) => c.hex.toUpperCase());
  const ground = idea.colors.ground.toUpperCase();
  // Texten måste synas mot botten; annars tar vi den färg i profilen som skiljer sig mest i ljushet.
  const ink = contrast(ground, idea.colors.ink) >= 70 ? idea.colors.ink.toUpperCase() : [...all, "#FFFFFF", "#0A0A0A"].reduce((a, b) => (contrast(ground, b) > contrast(ground, a) ? b : a));
  const G = add(ground);
  const I = add(ink);
  const grey = opts.portrait ? ["#FFFFFF", GREY_YARNS[0], GREY_YARNS[2], GREY_YARNS[1]].map((h) => add(h, 8)).filter((i) => i >= 0) : [];
  // Sköldens färger delar garn med profilens när de ligger nära (två röda nyanser blir ett garn).
  const crest = opts.crest ? club.crestColors.map((h) => add(h, 12)).filter((i) => i >= 0) : [];
  const accentHex = deltaE(idea.colors.accent, ground) >= 12 ? idea.colors.accent : (all.find((h) => deltaE(h, ground) >= 12 && deltaE(h, ink) >= 12) ?? ink);
  const A = Math.max(0, add(accentHex) >= 0 ? add(accentHex) : near(accentHex));
  // Ton i ton: en profilfärg nära botten, t.ex. mörkblå mot blå.
  const toneHex = all.filter((h) => deltaE(h, ground) >= 8 && deltaE(h, ground) <= 48 && deltaE(h, ink) >= 30).sort((a, b) => deltaE(a, ground) - deltaE(b, ground))[0];
  const toneAt = toneHex ? add(toneHex) : -1;
  const T = toneAt >= 0 ? toneAt : A;
  const crestYarns = opts.crest ? [...new Set([...crest, ...["#FFFFFF", "#0A0A0A"].map((h) => palette.findIndex((p) => deltaE(p, h) < 8)).filter((i) => i >= 0), ...club.crestColors.map(near)])] : [];
  return { palette, G, I, A, T, grey, crestYarns };
}

const solid = (yarn: Yarn): Fill => ({ kind: "solid", yarn });
const stripes = (...list: [Yarn, number][]): Stripe[] => list.map(([yarn, mm]) => ({ yarn, mm }));

/** `sign` är namnteckningar som beställaren själv har ritat; de ersätter exempelnamnen i receptet autograf. */
export function buildDesign(club: ScarfClub, idea: ScarfIdea, has: { crest: boolean; portrait: boolean; art: boolean }, sign?: SignStroke[] | null): Built {
  const recipe = idea.recipe;
  const wantsPortrait = recipe === "portratt" && has.portrait;
  const wantsArt = recipe === "motiv" && has.art && Boolean(idea.art);
  const wantsCrest = has.crest;
  const y = yarns(club, idea, { crest: wantsCrest, portrait: wantsPortrait });
  const { G, I, A, T } = y;
  const font = idea.font;

  const fm = up(idea.front.main) || up(club.name);
  const fs = up(idea.front.sub);
  const bm = up(idea.back.main) || up(club.nicknames[0] ?? club.shortName);
  const bs = up(idea.back.sub);
  // Okänt grundningsår: förkortningen står där årtalet annars hade stått.
  const year = club.founded ? String(club.founded) : up(club.shortName).slice(0, 5);

  const text = (main: string, sub: string, yarn: Yarn, extra: Partial<Extract<Content, { kind: "text" }>> = {}): Content => ({
    kind: "text",
    lines: [main, sub].filter(Boolean),
    font,
    yarn,
    stretch: main.length <= 8,
    ...extra,
  });
  /** Plattan bakom en sköld som annars försvinner i bottnen: den av text- och bottenfärgen som skiljer sig mest. */
  const plate = (ground: Yarn) => (contrast(y.palette[I], y.palette[ground]) >= contrast(y.palette[G], y.palette[ground]) ? I : G);
  const crestMark = (ground: Yarn): Content => ({ kind: "crest", yarns: y.crestYarns, plate: plate(ground) });
  const crest = (ground: Yarn, mm = 170): Section[] => (wantsCrest ? [{ mm, fill: solid(ground), content: crestMark(ground), pad: [12, 15] }] : []);
  const endBars = (ground: Yarn, ink: Yarn): Section => ({ mm: 72, fill: { kind: "bars", stripes: stripes([ink, 22], [ground, 8], [A === ground ? ink : A, 12], [ground, 8], [ink, 22]) } });
  const line = (yarn: Yarn, mm = 9): Section => ({ mm, fill: solid(yarn) });
  /** Detaljfärgen om den syns mot bottnen, annars reservfärgen. */
  const pop = (ground: Yarn, fallback: Yarn) => (A !== ground && contrast(y.palette[A], y.palette[ground]) >= 60 ? A : fallback);
  const thin = (yarn: Yarn): Face["edge"] => ({ stripes: stripes([-1, 6], [yarn, 4.5]), skip: 1 });
  /** Den vanliga baksidan: färgerna omvända, sköld i båda ändar och texten i mitten. */
  const plainBack = (): Face => ({
    sections: mirrored([endBars(I, G), ...crest(I)], [{ fill: solid(I), content: text(bm, bs, G) }]),
    edge: thin(A === I ? G : A),
  });

  let front: Face;
  let back: Face = plainBack();
  let consent: string | null = null;

  switch (recipe) {
    case "klassisk":
      front = { sections: mirrored([endBars(G, I), ...crest(G)], [{ fill: solid(G), content: text(fm, fs, I) }]), edge: thin(A === G ? I : A) };
      break;

    case "bar": {
      const bars: Section = { mm: 560, fill: { kind: "bars", stripes: stripes([I, 80], [G, 80]) } };
      front = { sections: mirrored([bars], wantsCrest ? [{ fill: solid(G), content: crestMark(G), pad: [16, 14] }] : [{ fill: solid(G), content: text(fm, "", I) }]) };
      back = { sections: mirrored([bars], [{ fill: solid(G), content: { kind: "text", lines: [bm.length <= 6 ? bm : year], font, yarn: I, stretch: true }, pad: [8, 30] }]) };
      break;
    }

    case "retro": {
      const hoops = (ground: Yarn, ink: Yarn): Fill => ({ kind: "hoops", stripes: stripes([ground, 15], [ink, 8], [ground, 5], [A === ground ? ink : A, 5], [ground, 114], [A === ground ? ink : A, 5], [ground, 5], [ink, 8], [ground, 15]) });
      const end = (ground: Yarn, ink: Yarn, label: string): Section => ({ mm: 104, fill: solid(ink), content: { kind: "text", lines: [label], font, yarn: ground, rotate: true }, pad: [16, 12] });
      const endLabel = fs && fs.length <= 5 ? fs : year;
      const fsub = fs && fs !== endLabel ? fs : "";
      front = { sections: mirrored([end(G, I, endLabel)], [{ fill: hoops(G, I), content: text(fm, fsub, I, { sub: 0.24 }), pad: [26, fsub ? 41 : 46] }]) };
      back = { sections: mirrored([end(I, G, endLabel)], [{ fill: hoops(I, G), content: text(bm, bs, G, { sub: 0.24 }), pad: [26, bs ? 41 : 46] }]) };
      break;
    }

    case "personlig": {
      const number: Section[] = idea.number.trim()
        ? [{ mm: 230, fill: solid(G), content: { kind: "text", lines: [idea.number.trim().slice(0, 2)], font, yarn: pop(G, I), outline: pop(G, I) === I ? undefined : I, stretch: true }, pad: [20, 18] }, line(pop(G, I), 5)]
        : [];
      front = { sections: [endBars(G, I), ...number, { fill: solid(G), content: text(fm, fs, I) }, ...crest(G), { ...endBars(G, I), flip: true }], edge: thin(A === G ? I : A) };
      consent = "Beställaren godkänner sitt eget namn och nummer i kassan. Stickas en och en efter beställning.";
      break;
    }

    case "profil": {
      const diag = (a: Yarn, b: Yarn): Section => ({ mm: 150, fill: { kind: "diagonal", stripes: stripes([a, 24], [b, 24]) } });
      front = { sections: mirrored([diag(I, G), line(A === G ? I : A), ...crest(G, 240)], [{ fill: solid(G), content: text(fm, fs, I) }]) };
      back = { sections: mirrored([diag(G, I), line(A === I ? G : A), ...crest(I, 240)], [{ fill: solid(I), content: text(bm, bs, G) }]) };
      break;
    }

    case "matchdag": {
      const half = T === G ? I : T;
      const halfInk = half === I ? G : I;
      front = {
        sections: [
          endBars(G, I),
          { fill: solid(G), content: text(fm, "", I, { group: "halvor", stretch: false }) },
          line(A === G ? I : A, 7),
          ...(wantsCrest ? crest(I, 190) : [{ mm: 150, fill: solid(I), content: { kind: "icon", icon: idea.icon ?? "stjarna", yarn: G } as Content, pad: [20, 30] as [number, number] }]),
          line(A === G ? I : A, 7),
          { fill: solid(half), content: text(fs || bm, "", halfInk, { group: "halvor", stretch: false }) },
          { ...endBars(half, halfInk), flip: true },
        ],
      };
      back = { sections: mirrored([{ mm: 150, fill: { kind: "chevron", stripes: stripes([I, 22], [G, 22]) } }, line(A === I ? G : A)], [{ fill: solid(I), content: text(bm, bs, G) }]) };
      break;
    }

    case "arena": {
      const check = (a: Yarn, b: Yarn): Section => ({ mm: 108, fill: { kind: "checker", yarns: [a, b], mm: 18 } });
      const lamp = (ground: Yarn, ink: Yarn): Section => ({ mm: 96, fill: solid(ground), content: { kind: "icon", icon: idea.icon ?? "stralkastare", yarn: ink }, pad: [8, 22] });
      front = { sections: mirrored([check(I, G), line(A === G ? I : A), ...crest(G, 160), lamp(G, I)], [{ fill: solid(G), content: text(fm, fs, I) }]) };
      back = { sections: mirrored([check(G, I), line(A === I ? G : A)], [{ fill: solid(I), content: text(bm, bs, G) }]) };
      break;
    }

    case "sicksack": {
      const zig = (ground: Yarn, ink: Yarn): Section => ({ mm: 290, fill: { kind: "zigzag", stripes: stripes([ground, 20], [ink, 10], [A === ground ? ink : A, 10], [ink, 10]), ampMm: 13, waveMm: 58 } });
      front = { sections: mirrored([zig(G, I), line(I)], [{ fill: solid(G), content: text(fm, fs, I) }]) };
      back = { sections: mirrored([zig(I, G), line(G)], [{ fill: solid(I), content: text(bm, bs, G) }]) };
      break;
    }

    case "vagor": {
      const sea = (ground: Yarn, ink: Yarn): Section => ({ mm: 270, fill: { kind: "waves", stripes: stripes([ground, 24], [ink, 9], [A === ground ? ink : A, 13], [ink, 9]), ampMm: 10, waveMm: 92 } });
      const mark = (ground: Yarn, ink: Yarn): Section[] => (idea.icon ? [{ mm: 110, fill: solid(ground), content: { kind: "icon", icon: idea.icon, yarn: ink }, pad: [10, 28] }] : []);
      front = { sections: mirrored([sea(G, I), line(I), ...mark(G, I)], [{ fill: solid(G), content: text(fm, fs, I) }]) };
      back = { sections: mirrored([sea(I, G), line(G), ...crest(I, 160)], [{ fill: solid(I), content: text(bm, bs, G) }]) };
      break;
    }

    case "toning": {
      const to = T === G ? A : T;
      const toInk = contrast(y.palette[to], y.palette[I]) >= contrast(y.palette[to], y.palette[G]) ? I : G;
      const fade = (from: Yarn, target: Yarn): Section => ({ mm: 250, fill: { kind: "fade", from, to: target } });
      front = { sections: mirrored([line(I, 24), ...crest(G, 180), fade(G, to)], [{ fill: solid(to), content: text(fm, fs, toInk) }]) };
      back = { sections: mirrored([line(G, 24), ...crest(I, 180), fade(I, G)], [{ fill: solid(G), content: text(bm, bs, I) }]) };
      break;
    }

    case "argyle": {
      const rhomb = (a: Yarn, b: Yarn, l: Yarn, mm: number): Section => ({ mm, fill: { kind: "diamonds", yarns: [a, b], wMm: 58, hMm: 90, line: l } });
      const tone = T === G ? A : T;
      front = { sections: mirrored([rhomb(G, tone, I, 232), line(I), ...crest(G, 160)], [{ fill: solid(G), content: text(fm, fs, I) }]) };
      back = { sections: mirrored([rhomb(G, tone, I, 348), line(I)], [{ fill: solid(G), content: text(bm, bs, I) }]) };
      break;
    }

    case "tapet": {
      const map: Partial<Record<IconId, BitmapId>> = { stjarna: "stjarna", hjarta: "hjarta", krona: "krona", boll: "boll", gran: "gran", snoflinga: "snostjarna" };
      const bitmap = (idea.icon && map[idea.icon]) || "stjarna";
      const tone = T === G ? A : T;
      const paper = (ground: Yarn, yarn: Yarn): Fill => ({ kind: "tile", ground, yarn, bitmap, brick: true });
      const through = (ground: Yarn, yarn: Yarn, s: Omit<Section, "fill">): Section => ({ ...s, fill: paper(ground, yarn), through: true });
      front = {
        sections: [line(I, 20), ...(wantsCrest ? [through(G, tone, { mm: 190, content: crestMark(G), pad: [14, 14] })] : []), through(G, tone, { content: text(fm, fs, I, { outline: G }), pad: [14, 20] }), ...(wantsCrest ? [through(G, tone, { mm: 190, content: crestMark(G), pad: [14, 14] })] : []), line(I, 20)],
      };
      back = { sections: [line(G, 20), through(I, A === I ? G : A, { content: text(bm, bs, G, { outline: I }), pad: [40, 20] }), line(G, 20)] };
      break;
    }

    case "jul": {
      const second: BitmapId = idea.icon === "gran" ? "gran" : "hjarta";
      const border = (ground: Yarn, ink: Yarn, detail: Yarn): NordicBand[] => [
        { line: ink, rows: 4 },
        { space: 3 },
        { bitmap: "sicksack", yarn: detail, pad: 1 },
        { space: 2 },
        { bitmap: "snostjarna", yarn: ink },
        { space: 2 },
        { bitmap: "sicksack", yarn: detail, pad: 1 },
        { space: 2 },
        { bitmap: second, yarn: ink },
        { space: 3 },
      ];
      const end = (ground: Yarn, ink: Yarn, detail: Yarn): Section[] => {
        const bands = border(ground, ink, detail);
        return [{ mm: nordicMm(bands, 2), fill: { kind: "nordic", ground, bands } }, line(ink, 5)];
      };
      const flake = (ground: Yarn, ink: Yarn, icon: IconId): Section => ({ mm: 104, fill: solid(ground), content: { kind: "icon", icon, yarn: ink }, pad: [8, 34] });
      const detail = A === G ? I : A;
      front = { sections: mirrored([...end(G, I, detail), ...crest(G, 150)], [flake(G, I, "snoflinga"), { fill: solid(G), content: text(fm, fs, I) }, flake(G, I, "snoflinga")]), edge: { stripes: stripes([-1, 5], [I, 3]), skip: 2 } };
      back = { sections: mirrored(end(I, G, A === I ? G : A), [flake(I, pop(I, G), "hjarta"), { fill: solid(I), content: text(bm, bs, G) }, flake(I, pop(I, G), "hjarta")]), edge: { stripes: stripes([-1, 5], [G, 3]), skip: 2 } };
      break;
    }

    case "motiv": {
      const middle: Section = wantsArt
        ? { mm: 250, fill: solid(G), content: { kind: "art", yarns: [...new Set([I, A, T])].filter((i) => i !== G) }, pad: [8, 8] }
        : { mm: 230, fill: solid(G), content: { kind: "icon", icon: idea.icon ?? "stjarna", yarn: pop(G, I), outline: pop(G, I) === I ? undefined : I }, pad: [14, 14] };
      const ends: Section[] = [{ mm: 54, fill: { kind: "bars", stripes: stripes([I, 18], [G, 8], [I, 8], [G, 20]) } }];
      front = {
        // Texterna får plats efter sin längd, så att de två halvorna blir lika höga.
        sections: fs
          ? mirrored(ends, [{ flex: fm.length + 2, fill: solid(G), content: text(fm, "", I, { stretch: false, group: "sidor" }) }, middle, { flex: fs.length + 2, fill: solid(G), content: text(fs, "", I, { stretch: false, group: "sidor" }) }])
          : mirrored(ends, [middle, { fill: solid(G), content: text(fm, "", I) }, middle]),
        edge: thin(A === G ? I : A),
      };
      break;
    }

    case "trupp": {
      const players = idea.roster.length ? idea.roster : ["1 LINDKVIST", "3 SVENSSON", "4 BERG", "6 ERIKSSON", "7 NILSSON", "8 LARSSON", "9 HOLM", "10 EKSTRÖM", "11 DAHL", "14 KARLSSON", "17 STRÖM", "21 NYMAN"];
      front = { sections: mirrored([endBars(G, I)], [{ fill: solid(G), content: { kind: "roster", title: fm, players, font, yarn: I, accent: contrast(y.palette[A], y.palette[G]) >= 90 ? A : I }, pad: [16, 13] }]) };
      back = { sections: mirrored([endBars(I, G), ...crest(I)], [{ fill: solid(I), content: text(bm, bs, G) }]), edge: thin(A === I ? G : A) };
      consent = "Spelarnas namn och nummer kräver klubbens och spelarnas godkännande.";
      break;
    }

    case "portratt": {
      const face: Section[] = wantsPortrait ? [{ mm: 214, fill: solid(G), content: { kind: "portrait", frame: I, yarns: y.grey }, pad: [10, 7] }] : [];
      front = { sections: [endBars(G, I), ...face, { fill: solid(G), content: text(fm, fs, I) }, ...crest(G, 160), { ...endBars(G, I), flip: true }], edge: thin(A === G ? I : A) };
      consent = "Porträtt och namn kräver personens skriftliga godkännande och klubbens.";
      break;
    }

    case "autograf": {
      // Rubriken till vänster, namnteckningarna över resten av halsduken och skölden sist – som porträttet, fast med bläck.
      const names = idea.roster.length ? idea.roster : SAMPLE_SIGNERS;
      const signs: Section = { fill: solid(G), content: { kind: "sign", yarn: I, names, strokes: sign?.length ? sign : undefined }, pad: [22, 20] };
      front = { sections: [endBars(G, I), { mm: 330, fill: solid(G), content: text(fm, fs, I), pad: [14, 30] }, line(pop(G, I), 5), signs, ...crest(G, 160), { ...endBars(G, I), flip: true }], edge: thin(A === G ? I : A) };
      consent = "Namnteckningar kräver klubbens och personernas skriftliga godkännande.";
      break;
    }
  }

  return { design: { palette: y.palette, front, back, backReads: "hold-up" }, uses: { crest: wantsCrest, portrait: wantsPortrait, art: wantsArt }, consent };
}

/** Ljus eller mörk botten – för att välja rätt variant av skölden i gränssnittet. */
export const isDark = (hex: string) => lum(hex) < 140;
