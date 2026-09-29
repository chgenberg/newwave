import type { Club } from "./types";

export const IFK_GOTEBORG: Club = {
  id: "ifk-goteborg",
  name: "IFK Göteborg",
  shortName: "IFK",
  nicknames: ["Blåvitt", "Änglarna", "Kamraterna"],
  city: "Göteborg",
  arena: "Gamla Ullevi",
  founded: 1904,
  newsQuery: '"IFK Göteborg" OR Blåvitt',
  tagline: "Hela stadens lag",
  tone: "Stolt, göteborgsk och lite glimten i ögat – hela stadens lag. Humor mot motståndare är okej, aldrig hat eller personangrepp.",
  palette: [
    { name: "IFK-blå", hex: "#234B9A" },
    { name: "Vit", hex: "#FFFFFF" },
    { name: "Mörkblå", hex: "#1A3770" },
    { name: "Sköldblå", hex: "#197BC4" },
    { name: "Svart (neutral)", hex: "#0A0A0A" },
  ],
  crestColors: ["#197BC4", "#FBC323", "#FFFFFF"],
  brand: {
    crest: { farg: "skold-farg.svg", svart: "skold-svart.svg", vit: "skold-vit.svg" },
    fonts: { brand: "Akkurat Black", web: "Source Sans Pro" },
    source: "ifkgoteborg.se",
  },
  forbiddenColors: [
    { name: "Grön", words: ["green", "grön", "grönt", "gröna"], reason: "Förknippas med GAIS och Hammarby" },
    { name: "Röd", words: ["red", "röd", "rött", "röda"], reason: "Förknippas med Örgryte IS" },
    { name: "Gul", words: ["yellow", "gul", "gult", "gula", "gold", "golden"], reason: "Förknippas med AIK – guldet finns bara i den officiella skölden" },
  ],
  bannedWords: ["hata", "hat", "död", "jävla", "fitta", "kuk", "bög", "idiot"],
  maxSloganLength: 32,
  rules: [
    "Endast klubbens färger: IFK-blå #234B9A, mörkblå #1A3770, sköldblå #197BC4, vit och svart som neutral.",
    "Endast den officiella klubbskölden – i fullfärg, eller svart/vit vid tryck i en färg. Den får aldrig ändras, beskäras eller färgläggas om. AI ritar aldrig sköld eller logga.",
    "Guldet (#FBC323) förekommer bara i skölden, aldrig i motiv eller text.",
    "Inga spelares namn, ansikten eller nummer – även om de nämns i nyheterna.",
    "Humor mot motståndare är okej, men inga svordomar, hat eller personangrepp.",
    "Slogan max 32 tecken, på svenska eller göteborgska.",
    "Motiv ska fungera i digitaltryck (DTG): max tre färger, tydliga former, inga fotografier.",
  ],
  intersportShopUrl: "https://www.intersport.se/klubbshop/ifk-goteborg",
  contactPerson: { role: "Klubbens merchandiseansvarige", channel: "e-post" },
  agent: {
    name: "Blåvitt-agenten",
    mission:
      "Skapa säljande, äkta supportermerch för IFK Göteborg helt automatiskt och publicera i klubbshoppen hos Intersport – utan att klubben behöver göra något.",
    guidelines: [
      "Följ IFK Göteborgs färger och grafiska profil utan undantag i standardläge.",
      "Använd bara IFK:s egna symboler: den officiella skölden, ränderna, Änglarna, Gamla Ullevi och göteborgska uttryck.",
      "Allt ska kännas som något en riktig Blåvitt-supporter vill bära – inte som reklam.",
      "Publicera bara det granskaren ger minst 8 av 10 i säljbarhet, realism och varumärkespassning.",
      "Aldrig spelarnamn, ansikten eller nummer. Aldrig hat, svordomar eller personangrepp.",
    ],
    satire: {
      allowed: true,
      when: "Derbyn, segrar mot rivaler och stormatcher – när supportrarna själva skämtar.",
      rules: [
        "Satir och memes får driva med motståndaren – med glimten i ögat, aldrig elakt.",
        "Motståndarens färger får användas som skämtelement (max en tredjedel av motivet).",
        "Aldrig motståndarens sköld, logotyp eller varumärken – bara färger, smeknamn och allmänna symboler.",
        "IFK ska alltid vara vinnaren i skämtet. Inget som kan uppfattas som hot eller trakasserier.",
      ],
      extraColors: [
        { name: "Svart (satir)", hex: "#111111" },
        { name: "AIK-gul (satir)", hex: "#FFD100" },
        { name: "Grön (satir)", hex: "#00843D" },
      ],
      maxPerRun: 2,
    },
    review: { minMotifSales: 7, minSales: 8, minRealism: 8, minBrandFit: 8, maxRetries: 1 },
    autopilot: { maxProductsPerRun: 3, maxRunsPerWeek: 4, publish: "auto" },
  },
};

export const CLUBS: Record<string, Club> = { [IFK_GOTEBORG.id]: IFK_GOTEBORG };
