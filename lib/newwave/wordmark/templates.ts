import { type ColorSlot, type Layer, type Template, type TemplateInput, TemplateSchema, type TextSlot } from "./schema";

/**
 * De inbyggda ordmärkena, i amerikansk vintagestil som NFL-, NHL- och collegetryck: spärrade versaler, fet skrivstil,
 * collegebokstäver med konturer, tunga serifer i båge över märket, kapslar, kransar och klubbmärket. Rutorna ligger på en duk som är 1000 enheter bred;
 * texten skalas så att den fyller sin ruta, så ett kort namn blir högt och ett långt smalare.
 */

type Box = { x: number; y: number; w: number; h: number };
type TextOpts = Partial<Omit<Extract<Layer, { kind: "text" }>, "kind" | "slot" | "font" | "color" | "box">>;
type ShapeOpts = Partial<Omit<Extract<Layer, { kind: "shape" }>, "kind" | "shape" | "colors" | "box">>;

const text = (slot: TextSlot, font: string, color: ColorSlot, box: Box, o: TextOpts = {}) => ({ kind: "text" as const, slot, font, color, box, ...o });
const caps = (slot: TextSlot, font: string, color: ColorSlot, box: Box, tracking: [number, number], o: TextOpts = {}) =>
  text(slot, font, color, box, { case: "upper", tracking, ...o });
const shape = (kind: Extract<Layer, { kind: "shape" }>["shape"], colors: ColorSlot[], box: Box, o: ShapeOpts = {}) => ({ kind: "shape" as const, shape: kind, colors, box, ...o });
const icon = (box: Box) => ({ kind: "icon" as const, box });
const CHECKER_BRIDGE = '<path d="M122.13 432.74L122.13 473.57C124.89 472.39 127.64 471.3 130.39 470.31L134.52 468.82L138.65 467.45C144.16 465.63 149.66 463.98 155.17 462.48L155.17 428.38C144.16 429.58 133.14 430.91 122.13 432.74" fill="{primary}"/><path d="M155.17 496.59L159.3 494.76L163.43 493.1C166.18 492.02 168.94 490.82 171.69 489.84C177.2 487.91 182.7 485.8 188.21 484.21L188.21 454.77C182.7 455.77 177.2 457.08 171.69 458.28C168.94 458.89 166.18 459.64 163.43 460.31L159.3 461.34L155.17 462.48ZM155.17 496.59" fill="{secondary}"/><path d="M188.21 425.34L188.21 454.77C199.22 452.53 210.23 450.8 221.25 449.31L221.25 423.2C210.23 423.78 199.22 424.46 188.21 425.34" fill="{primary}"/><path d="M221.25 475.43C232.26 473.05 243.27 471.2 254.29 469.81L254.29 445.81C243.27 446.68 232.26 447.83 221.25 449.31ZM221.25 475.43" fill="{secondary}"/><path d="M254.29 421.82L254.29 445.81C265.3 444.95 276.31 444.34 287.32 443.98L287.32 421.1C276.31 421.24 265.3 421.48 254.29 421.82" fill="{primary}"/><path d="M287.32 466.88C298.34 466.38 309.35 466.21 320.36 466.45L320.36 443.72C309.35 443.57 298.34 443.68 287.32 443.98ZM287.32 466.88" fill="{secondary}"/><path d="M320.36 421L320.36 443.72C331.38 443.92 342.39 444.37 353.4 445.11L353.4 421.54C342.39 421.25 331.38 421.07 320.36 421" fill="{primary}"/><path d="M353.4 468.68C364.42 469.89 375.43 471.56 386.44 473.8L386.44 448.3C375.43 446.9 364.42 445.86 353.4 445.11ZM353.4 468.68" fill="{secondary}"/><path d="M386.44 422.8L386.44 448.3C397.46 449.69 408.47 451.43 419.48 453.57L419.48 424.87C408.47 424.03 397.46 423.34 386.44 422.8" fill="{primary}"/><path d="M419.48 482.27C424.99 483.96 430.49 485.85 436 487.96L440.13 489.51C441.51 490.02 442.88 490.54 444.26 491.15L452.52 494.65L452.52 461.27L444.26 459.1C441.51 458.34 438.75 457.78 436 457.11C430.49 455.8 424.99 454.62 419.48 453.57ZM419.48 482.27" fill="{secondary}"/><path d="M452.52 427.9L452.52 461.27C463.53 464.38 474.55 467.83 485.56 472.46L485.56 432.3C474.55 430.48 463.53 429.12 452.52 427.9" fill="{primary}"/>';
/** Konturer innerst först: en spalt i plaggets färg och en kant i andrafärgen är grunden i varsitybokstäver. */
const gap = (inner: number, outer: number, color: ColorSlot = "secondary") => [
  { color: "paper" as const, width: inner },
  { color, width: outer },
];
/** Graduate är tunt i små grader; en kontur i textens egen färg gör den lika fet som tryckta collegebokstäver. */
const heavy = (color: ColorSlot, width = 2.5) => ({ outline: { color, width } });

const RAW: TemplateInput[] = [
  // --- Skrivstil ---------------------------------------------------------------
  {
    id: "retro-skript",
    name: "Retroskript",
    style: "Skrivstil",
    height: 690,
    fit: { ideal: [3, 10], max: 16 },
    layers: [
      caps("name1", "role:caps", "secondary", { x: 250, y: 0, w: 500, h: 64 }, [0.55, 0.22]),
      text("name2", "role:script", "primary", { x: 90, y: 78, w: 820, h: 250 }, { rotate: -7, maxLines: 2 }),
      shape("checker", ["secondary", "primary"], { x: 230, y: 360, w: 540, h: 80 }, { count: 11, rows: 2, arc: 12 }),
      icon({ x: 380, y: 465, w: 240, h: 220 }),
    ],
  },
  {
    // New Wave Groups dynamiska ordmärke för Gräsrot 360 (Bilaga 1): Casey Bold och Espiritu ersatta av Holtwood One SC
    // och Lobster, som får ritas på servern. Korta namn stannar vid Kullaviks bokstavshöjd, långa krymper till bredden.
    id: "grasrot-360",
    name: "Gräsrot 360",
    style: "Skrivstil",
    height: 746,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name1", "holtwood-one-sc", "primary", { x: 290, y: 0, w: 420, h: 97 }, [0.8, 0.35], { size: 80, clear: 16 }),
      text("name2", "lobster", "secondary", { x: 0, y: 53, w: 1000, h: 337 }, { rotate: -8, condense: 1.15, size: 280 }),
      // Rutbandet ur Bilaga 1: lodräta kolumner som välver sig som en bro, vilket checker-formens båge inte kan.
      { kind: "art" as const, box: { x: 139, y: 377, w: 746, h: 155 }, viewBox: [122.13, 421, 363.43, 75.59] as [number, number, number, number], svg: CHECKER_BRIDGE },
      icon({ x: 398, y: 516, w: 230, h: 230 }),
    ],
  },
  {
    id: "svansen",
    name: "Svansen",
    style: "Skrivstil",
    height: 470,
    fit: { ideal: [4, 10], max: 14 },
    layers: [
      text("name2", "yellowtail", "primary", { x: 60, y: 0, w: 880, h: 250 }, { rotate: -7, outline: gap(5, 6) }),
      shape("tail", ["primary"], { x: 250, y: 238, w: 700, h: 200 }),
      caps("name1", "graduate", "on", { x: 470, y: 322, w: 260, h: 50 }, [0.25, 0.1], { ...heavy("on"), rotate: -4 }),
      icon({ x: 110, y: 265, w: 200, h: 200 }),
    ],
  },
  {
    id: "rutskript",
    name: "Rutor och skript",
    style: "Skrivstil",
    height: 420,
    fit: { ideal: [4, 10], max: 14 },
    layers: [
      shape("checker", ["secondary"], { x: 40, y: 120, w: 920, h: 150 }, { count: 18, rows: 3 }),
      text("name2", "kaushan-script", "primary", { x: 70, y: 20, w: 860, h: 300 }, { rotate: -6, outline: { color: "paper", width: 11 }, shadow: { color: "ink", dx: 9, dy: 9, solid: true } }),
      caps("name1", "graduate", "secondary", { x: 340, y: 355, w: 320, h: 58 }, [0.45, 0.25], heavy("secondary")),
    ],
  },
  {
    id: "baseboll",
    name: "Baseboll",
    style: "Skrivstil",
    height: 470,
    fit: { ideal: [4, 10], max: 14 },
    layers: [
      text("name2", "lobster", "primary", { x: 60, y: 10, w: 880, h: 270 }, { rotate: -8, shadow: { color: "secondary", dx: 8, dy: 10, solid: true } }),
      shape("swash", ["primary"], { x: 170, y: 270, w: 740, h: 100 }, { rotate: -8 }),
      caps("tagline", "graduate", "secondary", { x: 300, y: 410, w: 400, h: 48 }, [0.35, 0.18], heavy("secondary")),
    ],
  },
  {
    id: "skriptbage",
    name: "Skriptbåge",
    style: "Skrivstil",
    height: 500,
    fit: { ideal: [4, 10], max: 14 },
    layers: [
      caps("name1", "graduate", "secondary", { x: 300, y: 0, w: 400, h: 90 }, [0.25, 0.12], { ...heavy("secondary"), arc: 40 }),
      text("name2", "grand-hotel", "primary", { x: 60, y: 95, w: 880, h: 280 }, { rotate: -6, outline: gap(6, 7) }),
      shape("stars", ["secondary"], { x: 380, y: 420, w: 240, h: 60 }, { count: 3 }),
    ],
  },
  {
    id: "solskript",
    name: "Solskript",
    style: "Skrivstil",
    height: 640,
    fit: { ideal: [4, 10], max: 14 },
    layers: [
      shape("burst", ["secondary"], { x: 360, y: 0, w: 280, h: 280 }, { count: 22 }),
      icon({ x: 405, y: 45, w: 190, h: 190 }),
      text("name2", "damion", "primary", { x: 60, y: 255, w: 880, h: 260 }, { rotate: -6, outline: { color: "paper", width: 10 } }),
      shape("rule", ["secondary"], { x: 150, y: 575, w: 200, h: 18 }),
      caps("tagline", "graduate", "secondary", { x: 370, y: 555, w: 260, h: 54 }, [0.3, 0.15], heavy("secondary")),
      shape("rule", ["secondary"], { x: 650, y: 575, w: 200, h: 18 }),
    ],
  },

  // --- Hjälm och kapsel ----------------------------------------------------------
  {
    id: "kapsel",
    name: "Kapseln",
    style: "Hjälm",
    height: 590,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "graduate", "primary", { x: 100, y: 0, w: 800, h: 190 }, [0.12, 0.04], { arc: 95, ...heavy("primary", 5) }),
      icon({ x: 360, y: 160, w: 280, h: 240 }),
      shape("pill", ["primary"], { x: 190, y: 430, w: 620, h: 150 }),
      caps("name1", "graduate", "primary", { x: 270, y: 462, w: 460, h: 86 }, [0.18, 0.08], heavy("primary", 4)),
    ],
  },
  {
    id: "hjalmen",
    name: "Hjälmen",
    style: "Hjälm",
    height: 600,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "bowlby-one-sc", "primary", { x: 110, y: 0, w: 780, h: 230 }, [0.06, 0.02], { arc: 115 }),
      icon({ x: 375, y: 175, w: 250, h: 220 }),
      shape("plate", ["primary"], { x: 200, y: 430, w: 600, h: 160 }),
      shape("pill", ["paper"], { x: 216, y: 446, w: 568, h: 128 }),
      caps("name1", "bowlby-one-sc", "on", { x: 290, y: 470, w: 420, h: 80 }, [0.16, 0.06]),
    ],
  },
  {
    id: "kapselbage",
    name: "Kapselbåge",
    style: "Hjälm",
    height: 500,
    fit: { ideal: [4, 14], max: 22 },
    layers: [
      caps("name1", "graduate", "secondary", { x: 330, y: 0, w: 340, h: 92 }, [0.2, 0.1], { ...heavy("secondary"), arc: 60 }),
      icon({ x: 380, y: 92, w: 240, h: 220 }),
      shape("pill", ["primary", "secondary"], { x: 60, y: 330, w: 880, h: 165 }, { rows: 2 }),
      caps("name2", "graduate", "primary", { x: 150, y: 372, w: 700, h: 82 }, [0.12, 0.04], heavy("primary", 4)),
    ],
  },
  {
    id: "overlapp",
    name: "Överlapp",
    style: "Hjälm",
    height: 520,
    fit: { ideal: [3, 9], max: 13 },
    layers: [
      caps("name2", "graduate", "primary", { x: 60, y: 0, w: 880, h: 300 }, [0.04, 0], { condense: 0.62, warp: { kind: "bridge", amount: 0.35 }, outline: gap(4, 6) }),
      icon({ x: 430, y: 235, w: 320, h: 280 }),
    ],
  },
  {
    id: "stadion",
    name: "Stadion",
    style: "Hjälm",
    height: 640,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "graduate", "primary", { x: 60, y: 0, w: 880, h: 230 }, [0.04, 0], { condense: 0.6, warp: { kind: "bridge", amount: 0.3 }, outline: gap(4, 7) }),
      caps("name1", "graduate", "primary", { x: 150, y: 400, w: 700, h: 230 }, [0.06, 0], { condense: 0.6, warp: { kind: "bridge", amount: -0.25 }, outline: gap(4, 7) }),
      icon({ x: 320, y: 215, w: 360, h: 230 }),
    ],
  },
  {
    id: "valvet",
    name: "Valvet",
    style: "Hjälm",
    height: 620,
    fit: { ideal: [4, 12], max: 16 },
    layers: [
      caps("name1", "graduate", "secondary", { x: 330, y: 0, w: 340, h: 60 }, [0.6, 0.35], heavy("secondary")),
      caps("name2", "big-shoulders-black", "primary", { x: 60, y: 70, w: 880, h: 230 }, [0.04, 0], { warp: { kind: "arch", amount: 0.32 }, outline: gap(4, 6) }),
      icon({ x: 360, y: 285, w: 280, h: 250 }),
      shape("rule", ["secondary"], { x: 150, y: 570, w: 190, h: 18 }),
      caps("tagline", "graduate", "secondary", { x: 360, y: 550, w: 280, h: 56 }, [0.3, 0.15], heavy("secondary")),
      shape("rule", ["secondary"], { x: 660, y: 570, w: 190, h: 18 }),
    ],
  },

  // --- College -----------------------------------------------------------------
  {
    id: "college-bage",
    name: "Collegebåge",
    style: "College",
    height: 580,
    fit: { ideal: [3, 9], max: 14 },
    layers: [
      caps("name2", "graduate", "primary", { x: 60, y: 0, w: 880, h: 230 }, [0.08, 0.02], { arc: 50, outline: gap(4, 7), shadow: { color: "secondary", dx: 0, dy: 14, solid: true } }),
      caps("name1", "graduate", "secondary", { x: 340, y: 270, w: 320, h: 66 }, [0.3, 0.15], heavy("secondary")),
      icon({ x: 400, y: 360, w: 200, h: 200 }),
    ],
  },
  {
    id: "tvaradig",
    name: "Tvåradig",
    style: "College",
    height: 520,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "big-shoulders-black", "secondary", { x: 100, y: 0, w: 800, h: 190 }, [0.06, 0.02], { warp: { kind: "bridge", amount: 0.28 } }),
      caps("name1", "ultra", "primary", { x: 120, y: 215, w: 760, h: 290 }, [0.04, 0], { outline: gap(5, 7) }),
    ],
  },

  // --- Campus: amerikanska collegetröjor, oftast i en färg ---------------------------
  {
    id: "campus",
    name: "Campus",
    style: "Campus",
    height: 590,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "bevan", "primary", { x: 70, y: 0, w: 860, h: 220 }, [0.08, 0.02], { arc: 55 }),
      caps("est", "bevan", "primary", { x: 175, y: 330, w: 150, h: 54 }, [0.1, 0.1]),
      icon({ x: 370, y: 225, w: 260, h: 260 }),
      caps("year", "bevan", "primary", { x: 675, y: 330, w: 150, h: 54 }, [0.1, 0.1]),
      caps("sport", "graduate", "primary", { x: 250, y: 520, w: 500, h: 62 }, [0.5, 0.3], heavy("primary")),
    ],
  },
  {
    id: "akademi",
    name: "Akademi",
    style: "Campus",
    height: 600,
    fit: { ideal: [3, 10], max: 16 },
    layers: [
      caps("name2", "bevan", "primary", { x: 60, y: 0, w: 880, h: 250 }, [0.06, 0.01], { maxLines: 2 }),
      icon({ x: 405, y: 280, w: 190, h: 190 }),
      caps("sport", "graduate", "primary", { x: 290, y: 490, w: 420, h: 52 }, [0.6, 0.35], heavy("primary")),
      caps("est", "graduate", "primary", { x: 325, y: 556, w: 140, h: 40 }, [0.2, 0.2], { ...heavy("primary", 1.5), align: "right" }),
      caps("year", "graduate", "primary", { x: 535, y: 556, w: 140, h: 40 }, [0.2, 0.2], { ...heavy("primary", 1.5), align: "left" }),
    ],
  },
  {
    id: "monogram",
    name: "Monogram",
    style: "Campus",
    height: 560,
    fit: { ideal: [3, 12], max: 18 },
    layers: [
      caps("name2", "bevan", "primary", { x: 140, y: 0, w: 720, h: 110 }, [0.3, 0.12]),
      caps("est", "bevan", "primary", { x: 140, y: 260, w: 150, h: 52 }, [0.1, 0.1]),
      caps("monogram", "graduate", "primary", { x: 320, y: 140, w: 360, h: 290 }, [0.04, 0], { outline: gap(5, 8) }),
      caps("year", "bevan", "primary", { x: 710, y: 260, w: 150, h: 52 }, [0.1, 0.1]),
      caps("sport", "graduate", "primary", { x: 300, y: 485, w: 400, h: 58 }, [0.5, 0.3], heavy("primary")),
    ],
  },
  {
    id: "universitet",
    name: "Universitet",
    style: "Campus",
    height: 470,
    fit: { ideal: [3, 11], max: 16 },
    layers: [
      caps("name1", "graduate", "secondary", { x: 330, y: 0, w: 340, h: 56 }, [0.6, 0.35], heavy("secondary")),
      caps("name2", "holtwood-one-sc", "primary", { x: 50, y: 70, w: 900, h: 220 }, [0.04, 0], { arc: 38, outline: gap(3, 5) }),
      shape("rule", ["secondary"], { x: 150, y: 330, w: 700, h: 16 }),
      caps("sport", "holtwood-one-sc", "primary", { x: 270, y: 362, w: 460, h: 52 }, [0.3, 0.15]),
      caps("est", "graduate", "secondary", { x: 325, y: 428, w: 140, h: 38 }, [0.2, 0.2], { ...heavy("secondary", 1.5), align: "right" }),
      caps("year", "graduate", "secondary", { x: 535, y: 428, w: 140, h: 38 }, [0.2, 0.2], { ...heavy("secondary", 1.5), align: "left" }),
    ],
  },
  {
    id: "skuggserif",
    name: "Skuggserif",
    style: "Campus",
    height: 420,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "bevan", "primary", { x: 50, y: 0, w: 900, h: 240 }, [0.04, 0], { outline: { color: "paper", width: 4 }, shadow: { color: "secondary", dx: 11, dy: 11, solid: true } }),
      text("sport", "grand-hotel", "secondary", { x: 280, y: 250, w: 440, h: 150 }, { rotate: -6 }),
    ],
  },
  {
    id: "campusvalv",
    name: "Campusvalv",
    style: "Campus",
    height: 640,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "holtwood-one-sc", "primary", { x: 60, y: 0, w: 880, h: 200 }, [0.06, 0.02], { arc: 70 }),
      caps("name1", "holtwood-one-sc", "primary", { x: 330, y: 205, w: 340, h: 76 }, [0.35, 0.15]),
      shape("ring", ["primary"], { x: 370, y: 305, w: 260, h: 260 }, { count: 1 }),
      icon({ x: 410, y: 345, w: 180, h: 180 }),
      caps("est", "graduate", "primary", { x: 200, y: 410, w: 140, h: 50 }, [0.2, 0.2], heavy("primary")),
      caps("year", "graduate", "primary", { x: 660, y: 410, w: 140, h: 50 }, [0.2, 0.2], heavy("primary")),
      caps("sport", "graduate", "primary", { x: 320, y: 585, w: 360, h: 50 }, [0.5, 0.3], heavy("primary")),
    ],
  },

  // --- Emblem -----------------------------------------------------------------
  {
    id: "lagerkrans",
    name: "Lagerkrans",
    style: "Emblem",
    height: 660,
    fit: { ideal: [3, 10], max: 16 },
    layers: [
      shape("laurel", ["primary"], { x: 320, y: 0, w: 360, h: 340 }, { count: 8 }),
      icon({ x: 405, y: 70, w: 190, h: 190 }),
      caps("name2", "ultra", "primary", { x: 60, y: 345, w: 880, h: 170 }, [0.03, 0], { maxLines: 2 }),
      shape("bars", ["primary", "secondary"], { x: 60, y: 522, w: 880, h: 34 }),
      caps("name1", "graduate", "secondary", { x: 200, y: 560, w: 600, h: 62 }, [0.8, 0.45], heavy("secondary")),
      shape("rule", ["primary"], { x: 60, y: 628, w: 880, h: 40 }),
    ],
  },
  {
    id: "emblem",
    name: "Emblem",
    style: "Emblem",
    height: 700,
    fit: { ideal: [3, 10], max: 13 },
    layers: [
      shape("ring", ["primary", "secondary"], { x: 150, y: 0, w: 700, h: 700 }, { count: 2 }),
      caps("name2", "graduate", "primary", { x: 250, y: 85, w: 500, h: 120 }, [0.14, 0.05], { arc: 120 }),
      icon({ x: 360, y: 225, w: 280, h: 250 }),
      shape("stars", ["secondary"], { x: 205, y: 325, w: 80, h: 60 }, { count: 1 }),
      shape("stars", ["secondary"], { x: 715, y: 325, w: 80, h: 60 }, { count: 1 }),
      caps("tagline", "graduate", "secondary", { x: 300, y: 515, w: 400, h: 78 }, [0.28, 0.14], { ...heavy("secondary"), arc: -90 }),
    ],
  },
  {
    id: "skold",
    name: "Sköld",
    style: "Emblem",
    height: 640,
    fit: { ideal: [3, 9], max: 13 },
    layers: [
      shape("shield", ["secondary"], { x: 236, y: -14, w: 528, h: 654 }),
      shape("shield", ["primary"], { x: 250, y: 0, w: 500, h: 620 }),
      caps("name1", "graduate", "on", { x: 330, y: 40, w: 340, h: 60 }, [0.4, 0.2], heavy("on")),
      icon({ x: 375, y: 120, w: 250, h: 210 }),
      caps("name2", "ultra", "on", { x: 300, y: 345, w: 400, h: 120 }, [0.04, 0], { maxLines: 2 }),
    ],
  },
  {
    id: "liggande",
    name: "Liggande",
    style: "Emblem",
    height: 300,
    fit: { ideal: [3, 12], max: 20 },
    layers: [
      icon({ x: 0, y: 0, w: 300, h: 300 }),
      caps("name1", "graduate", "secondary", { x: 330, y: 22, w: 600, h: 60 }, [0.5, 0.25], { ...heavy("secondary"), align: "left" }),
      caps("name2", "ultra", "primary", { x: 330, y: 92, w: 660, h: 140 }, [0.03, 0], { align: "left", maxLines: 2 }),
      shape("bars", ["primary", "secondary"], { x: 330, y: 250, w: 600, h: 36 }),
    ],
  },
  {
    id: "banderoll",
    name: "Banderoll",
    style: "Emblem",
    height: 520,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      icon({ x: 400, y: 0, w: 200, h: 190 }),
      shape("banner", ["secondary"], { x: 44, y: 222, w: 912, h: 200 }, { arc: 16 }),
      shape("banner", ["primary"], { x: 60, y: 215, w: 880, h: 190 }, { arc: 16 }),
      caps("name2", "bowlby-one-sc", "on", { x: 170, y: 245, w: 660, h: 130 }, [0.08, 0.02], { arc: 16 }),
      caps("name1", "graduate", "secondary", { x: 350, y: 450, w: 300, h: 62 }, [0.5, 0.3], heavy("secondary")),
    ],
  },

  // --- Hockey och 70-tal -------------------------------------------------------------
  {
    id: "hockeyranderna",
    name: "Hockeyränder",
    style: "Hockey",
    height: 620,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      caps("name2", "graduate", "primary", { x: 80, y: 0, w: 840, h: 200 }, [0.08, 0.02], { arc: 40, outline: gap(4, 6) }),
      shape("stripes", ["secondary", "primary", "secondary"], { x: 0, y: 285, w: 1000, h: 130 }, { count: 3 }),
      shape("disc", ["paper"], { x: 360, y: 205, w: 280, h: 280 }),
      icon({ x: 385, y: 225, w: 230, h: 240 }),
      caps("name1", "graduate", "secondary", { x: 330, y: 525, w: 340, h: 70 }, [0.45, 0.25], heavy("secondary")),
    ],
  },
  {
    id: "puck",
    name: "Pucken",
    style: "Hockey",
    height: 620,
    fit: { ideal: [3, 10], max: 13 },
    layers: [
      shape("disc", ["primary"], { x: 190, y: 0, w: 620, h: 620 }),
      shape("ring", ["paper"], { x: 222, y: 32, w: 556, h: 556 }),
      caps("name2", "graduate", "on", { x: 290, y: 78, w: 420, h: 110 }, [0.14, 0.05], { arc: 110 }),
      shape("disc", ["paper"], { x: 375, y: 195, w: 250, h: 250 }),
      icon({ x: 395, y: 215, w: 210, h: 210 }),
      caps("tagline", "graduate", "on", { x: 320, y: 450, w: 360, h: 70 }, [0.28, 0.14], { ...heavy("on"), arc: -80 }),
    ],
  },
  {
    id: "sjuttiotal",
    name: "Sjuttiotal",
    style: "70-tal",
    height: 440,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      text("name2", "shrikhand", "primary", { x: 60, y: 10, w: 880, h: 290 }, { rotate: -6, maxLines: 2, outline: gap(6, 9), shadow: { color: "primary", dx: 12, dy: 12, solid: true } }),
      caps("name1", "graduate", "secondary", { x: 330, y: 365, w: 340, h: 64 }, [0.5, 0.3], heavy("secondary")),
    ],
  },
  {
    id: "solnedgang",
    name: "Solnedgång",
    style: "70-tal",
    height: 650,
    fit: { ideal: [3, 10], max: 14 },
    layers: [
      shape("burst", ["secondary"], { x: 270, y: 0, w: 460, h: 460 }, { count: 30 }),
      shape("disc", ["paper"], { x: 360, y: 90, w: 280, h: 280 }),
      icon({ x: 385, y: 115, w: 230, h: 230 }),
      text("name2", "shrikhand", "primary", { x: 60, y: 330, w: 880, h: 240 }, { rotate: -5, outline: { color: "paper", width: 11 } }),
      caps("name1", "graduate", "secondary", { x: 340, y: 590, w: 320, h: 58 }, [0.5, 0.3], heavy("secondary")),
    ],
  },
  {
    id: "stjarnbage",
    name: "Stjärnbåge",
    style: "Hockey",
    height: 560,
    fit: { ideal: [3, 11], max: 15 },
    layers: [
      shape("stars", ["secondary"], { x: 300, y: 0, w: 400, h: 64 }, { count: 5, arc: 30 }),
      caps("name2", "ultra", "primary", { x: 60, y: 80, w: 880, h: 200 }, [0.08, 0.02], { arc: 30, outline: gap(4, 6) }),
      caps("name1", "graduate", "secondary", { x: 360, y: 300, w: 280, h: 58 }, [0.5, 0.3], heavy("secondary")),
      icon({ x: 410, y: 380, w: 180, h: 170 }),
    ],
  },

  // --- Jubileum: visas bara för klubbar med känt grundandeår ----------------------------
  {
    id: "jubileum",
    name: "Jubileum",
    style: "Jubileum",
    height: 740,
    fit: { ideal: [3, 11], max: 16 },
    needs: ["jubilee"],
    layers: [
      caps("name2", "graduate", "primary", { x: 150, y: 0, w: 700, h: 110 }, [0.14, 0.05], { ...heavy("primary"), arc: 40 }),
      shape("laurel", ["primary", "secondary"], { x: 300, y: 120, w: 400, h: 380 }, { count: 9 }),
      icon({ x: 395, y: 205, w: 210, h: 210 }),
      caps("jubilee", "ultra", "primary", { x: 200, y: 510, w: 600, h: 150 }, [0.04, 0], { outline: gap(4, 6) }),
      caps("span", "graduate", "secondary", { x: 300, y: 680, w: 400, h: 56 }, [0.3, 0.2], heavy("secondary")),
    ],
  },
  {
    id: "jubileumsband",
    name: "Jubileumsband",
    style: "Jubileum",
    height: 520,
    fit: { ideal: [3, 10], max: 14 },
    needs: ["jubilee"],
    layers: [
      caps("name2", "bevan", "primary", { x: 60, y: 0, w: 880, h: 200 }, [0.06, 0.02], { arc: 30 }),
      shape("banner", ["secondary"], { x: 144, y: 232, w: 712, h: 150 }, { arc: 12 }),
      shape("banner", ["primary"], { x: 160, y: 225, w: 680, h: 140 }, { arc: 12 }),
      caps("jubilee", "bowlby-one-sc", "on", { x: 260, y: 247, w: 480, h: 96 }, [0.1, 0.04], { arc: 12 }),
      caps("span", "graduate", "primary", { x: 330, y: 400, w: 340, h: 52 }, [0.3, 0.2], heavy("primary")),
      shape("stars", ["secondary"], { x: 380, y: 470, w: 240, h: 44 }, { count: 3 }),
    ],
  },

  // --- Rygg: namn och nummer ---------------------------------------------------------
  {
    id: "spelarrygg",
    name: "Spelarrygg",
    style: "Rygg",
    height: 800,
    fit: { ideal: [3, 14], max: 24 },
    layers: [
      caps("player", "graduate", "primary", { x: 150, y: 0, w: 700, h: 120 }, [0.2, 0.08], { ...heavy("primary"), arc: 22 }),
      caps("number", "graduate", "primary", { x: 220, y: 140, w: 560, h: 560 }, [0.02, 0], { outline: gap(8, 12) }),
      caps("name2", "graduate", "secondary", { x: 300, y: 730, w: 400, h: 60 }, [0.4, 0.25], heavy("secondary")),
    ],
  },
  {
    id: "ryggskript",
    name: "Ryggskript",
    style: "Rygg",
    height: 780,
    fit: { ideal: [3, 10], max: 16 },
    layers: [
      text("name2", "role:script", "primary", { x: 80, y: 0, w: 840, h: 220 }, { rotate: -6 }),
      caps("number", "ultra", "primary", { x: 280, y: 230, w: 440, h: 430 }, [0.02, 0], { outline: gap(6, 9) }),
      caps("player", "graduate", "secondary", { x: 200, y: 690, w: 600, h: 80 }, [0.25, 0.1], heavy("secondary")),
    ],
  },

  // --- Små versioner: väljs automatiskt för bröstlogga, ärm och keps, listas inte ----------------
  {
    id: "liten-monogram",
    name: "Liten: monogram",
    style: "Liten",
    height: 450,
    fit: { ideal: [1, 30], max: 40 },
    hidden: true,
    layers: [
      caps("monogram", "graduate", "primary", { x: 250, y: 0, w: 500, h: 330 }, [0.04, 0], { outline: gap(5, 8) }),
      caps("name2", "graduate", "secondary", { x: 150, y: 355, w: 700, h: 90 }, [0.2, 0.08], heavy("secondary")),
    ],
  },
  {
    id: "liten-skript",
    name: "Liten: skrivstil",
    style: "Liten",
    height: 280,
    fit: { ideal: [1, 30], max: 40 },
    hidden: true,
    layers: [text("name2", "role:script", "primary", { x: 40, y: 0, w: 920, h: 270 }, { rotate: -6, maxLines: 2 })],
  },
  {
    id: "liten-emblem",
    name: "Liten: märke",
    style: "Liten",
    height: 440,
    fit: { ideal: [1, 30], max: 40 },
    hidden: true,
    layers: [icon({ x: 330, y: 0, w: 340, h: 300 }), caps("name2", "ultra", "primary", { x: 100, y: 320, w: 800, h: 110 }, [0.04, 0])],
  },
];

export const TEMPLATES: Template[] = RAW.map((t) => TemplateSchema.parse(t));
export const isBackTemplate = (id: string) => TEMPLATES.find((t) => t.id === id)?.style === "Rygg";

const SMALL: Record<string, string> = { Skrivstil: "liten-skript", Emblem: "liten-emblem", Hockey: "liten-emblem", Jubileum: "liten-emblem" };
/** Mallens version för små tryck: egen om mallen har en, annars stilens. */
export const smallFor = (t: Pick<Template, "small" | "style">) => t.small ?? SMALL[t.style] ?? "liten-monogram";
