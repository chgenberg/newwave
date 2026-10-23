/**
 * Ett wordmark i en design sparas som mall och val, inte som bild. Varje klubb får då sin egen version – med sitt
 * namn, sina färger och sitt märke – och bilden ritas av /api/v1/newwave/wordmark när den behövs.
 */
export type WordmarkNames = { name1?: string; name2?: string };
export type WordmarkSpec = {
  template: string;
  /** Klubbens märke i wordmarket. */
  icon: boolean;
  /** Rutband, ränder, stjärnor och andra ornament. */
  ornament: boolean;
  /** Nött vintagetryck i stället för rent. */
  worn?: boolean;
  /** Egna namn per klubb; saknas = namnet delas automatiskt. */
  names?: Record<string, WordmarkNames>;
  /** Lag eller sektion, t.ex. "Dam" eller "P-12", i stället för sporten. */
  team?: string;
  /** Namn och nummer på ryggen. */
  player?: string;
  number?: string;
};
/** club = klubbens huvudfärg som bakgrund, för sociala medier och plagg i klubbfärgen. */
export type WordmarkVariant = "light" | "dark" | "club";

/** Höjs när motorn eller de inbyggda mallarna ritar annorlunda; står i adressen så att alla cacher släpper den gamla bilden. */
export const WORDMARK_VERSION = 4;
export const WORDMARK_PATH = "/api/v1/newwave/wordmark";
export const WORDMARK_SIZES = [240, 480, 800, 1200, 2400, 3543] as const;
const TEMPLATE_ID = /^[a-z0-9-]{2,40}$/;
/** Samma som klubbregistrets id:n, där långa föreningsnamn ger upp till 80 tecken. */
const CLUB_ID = /^[a-z0-9-]{1,80}$/;
const MAX_NAME = 30;
const NUMBER = /^\d{1,2}$/;
/** Tryck upp till så här många cm breda får mallens lilla version: bröstlogga, ärm och keps. */
export const SMALL_PRINT_CM = 10;

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, MAX_NAME) : undefined) || undefined;

export function cleanSpec(raw: unknown): WordmarkSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.template !== "string" || !TEMPLATE_ID.test(r.template)) return undefined;
  const names: Record<string, WordmarkNames> = {};
  if (r.names && typeof r.names === "object") {
    for (const [club, v] of Object.entries(r.names as Record<string, unknown>).slice(0, 60)) {
      if (!CLUB_ID.test(club) || !v || typeof v !== "object") continue;
      const n = { name1: cleanName((v as WordmarkNames).name1), name2: cleanName((v as WordmarkNames).name2) };
      if (n.name1 || n.name2) names[club] = n;
    }
  }
  const [team, player] = [cleanName(r.team), cleanName(r.player)];
  const number = typeof r.number === "string" && NUMBER.test(r.number) ? r.number : undefined;
  return {
    template: r.template,
    icon: r.icon !== false,
    ornament: r.ornament !== false,
    ...(r.worn === true ? { worn: true } : {}),
    names: Object.keys(names).length ? names : undefined,
    ...(team ? { team } : {}),
    ...(player ? { player } : {}),
    ...(number ? { number } : {}),
  };
}

export type WordmarkQuery = {
  template: string;
  club: string;
  name1?: string;
  name2?: string;
  team?: string;
  player?: string;
  number?: string;
  icon: boolean;
  ornament: boolean;
  worn: boolean;
  /** Mallens lilla version, för små tryck. */
  compact: boolean;
  variant: WordmarkVariant;
  size: number;
  format: "png" | "svg";
};

/** Med `printCm` får små tryck (till och med SMALL_PRINT_CM) mallens lilla version automatiskt. */
export function wordmarkUrl(spec: WordmarkSpec, club: string, variant: WordmarkVariant, size = 1200, format: "png" | "svg" = "png", printCm?: number) {
  const n = spec.names?.[club];
  const q = new URLSearchParams({ t: spec.template, c: club });
  if (n?.name1) q.set("n1", n.name1);
  if (n?.name2) q.set("n2", n.name2);
  if (spec.team) q.set("tm", spec.team);
  if (spec.player) q.set("pn", spec.player);
  if (spec.number) q.set("nr", spec.number);
  if (!spec.icon) q.set("i", "0");
  if (!spec.ornament) q.set("o", "0");
  if (spec.worn) q.set("w", "1");
  if (printCm !== undefined && printCm <= SMALL_PRINT_CM) q.set("k", "1");
  q.set("v", variant);
  q.set("s", String(size));
  if (format === "svg") q.set("f", "svg");
  q.set("r", String(WORDMARK_VERSION));
  return `${WORDMARK_PATH}?${q}`;
}

export function parseWordmarkQuery(params: URLSearchParams): WordmarkQuery | null {
  const template = params.get("t") ?? "";
  const club = params.get("c") ?? "";
  const size = Number(params.get("s") ?? 1200);
  const v = params.get("v");
  const variant: WordmarkVariant = v === "dark" || v === "club" ? v : "light";
  if (!TEMPLATE_ID.test(template) || !CLUB_ID.test(club) || !(WORDMARK_SIZES as readonly number[]).includes(size)) return null;
  return {
    template,
    club,
    name1: cleanName(params.get("n1")),
    name2: cleanName(params.get("n2")),
    team: cleanName(params.get("tm")),
    player: cleanName(params.get("pn")),
    number: NUMBER.test(params.get("nr") ?? "") ? params.get("nr")! : undefined,
    icon: params.get("i") !== "0",
    ornament: params.get("o") !== "0",
    worn: params.get("w") === "1",
    compact: params.get("k") === "1",
    variant,
    size,
    format: params.get("f") === "svg" ? "svg" : "png",
  };
}

export type SocialKind = "profil" | "banner" | "story" | "anim";
/** Wordmarket på klubbens huvudfärg i ett format för sociala medier; `anim` är en animerad SVG. */
export const wordmarkSocialUrl = (spec: WordmarkSpec, club: string, kind: SocialKind) =>
  `${wordmarkUrl(spec, club, "club").replace(WORDMARK_PATH, `${WORDMARK_PATH}/social`)}&f=${kind}`;

export type ExportOpts = { method: string; product: string; cm: number; garment: string; info?: boolean };
/** Tryckfilerna (zip) eller, med `info`, färger, Pantone och pris som JSON. */
export function wordmarkExportUrl(spec: WordmarkSpec, club: string, o: ExportOpts) {
  const q = new URLSearchParams({ m: o.method, p: o.product, cm: String(o.cm), g: o.garment, ...(o.info ? { info: "1" } : {}) });
  return `${wordmarkUrl(spec, club, "light").replace(WORDMARK_PATH, `${WORDMARK_PATH}/export`)}&${q}`;
}

/** Läser en wordmark-URL som sajten själv har byggt, t.ex. när mockupmotorn får den som logga. */
export function parseWordmarkUrl(url: string): WordmarkQuery | null {
  if (!url.startsWith(`${WORDMARK_PATH}?`)) return null;
  return parseWordmarkQuery(new URLSearchParams(url.slice(WORDMARK_PATH.length + 1)));
}
