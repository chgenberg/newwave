export type ColorToken = { name: string; hex: string };

export type Club = {
  id: string;
  name: string;
  shortName: string;
  nicknames: string[];
  city: string;
  arena: string;
  founded: number;
  tagline: string;
  tone: string;
  newsQuery: string;
  palette: ColorToken[];
  crestColors: string[];
  brand: {
    crest: { farg: string; svart: string; vit: string };
    fonts: { brand: string; web: string };
    source: string;
  };
  forbiddenColors: { name: string; words: string[]; reason: string }[];
  bannedWords: string[];
  maxSloganLength: number;
  rules: string[];
  intersportShopUrl: string;
  contactPerson: { role: string; channel: string };
  agent: ClubAgent;
};

export type ClubAgent = {
  name: string;
  mission: string;
  guidelines: string[];
  satire: {
    allowed: boolean;
    when: string;
    rules: string[];
    extraColors: ColorToken[];
    maxPerRun: number;
  };
  review: { minMotifSales: number; minSales: number; minRealism: number; minBrandFit: number; maxRetries: number };
  autopilot: { maxProductsPerRun: number; maxRunsPerWeek: number; publish: "auto" | "godkännande" };
};

export type Signal = {
  id: string;
  kind: "occasion" | "season" | "trend" | "news" | "custom" | "match";
  title: string;
  detail: string;
  date?: string;
  daysUntil?: number;
  source?: { name: string; url: string; published: string };
};

export type Concept = {
  id: string;
  signal: string;
  mode: "standard" | "satir";
  title: string;
  slogan: string;
  story: string;
  style: string;
  artDirection: string;
  palette: string[];
  products: string[];
};

export type RuleCheck = { rule: string; ok: boolean; note?: string };

export type CatalogProduct = {
  id: string;
  name: string;
  kind: "tee" | "hoodie" | "mug";
  garmentColor: string;
  garmentHex: string;
  dark: boolean;
  priceSek: number;
  sizes: string[];
  printArea: { widthCm: number; heightCm: number; method: string };
};

export type ContentPack = {
  instagram: { caption: string; hashtags: string[] };
  facebook: { post: string };
  linkedin: { post: string };
  tiktok: { hook: string; script: string[]; caption: string };
  newsletter: { subject: string; body: string };
  banner: { headline: string; subline: string; altText: string };
  tv: { headline: string; subline: string };
  plan: { date: string; channel: string; action: string }[];
};

export type Review = {
  realism: number;
  relevance: number;
  brandFit: number;
  sales: number;
  verdict: "publicera" | "underkänd";
  strengths: string[];
  issues: string[];
  summary: string;
};
