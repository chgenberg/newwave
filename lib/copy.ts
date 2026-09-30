import type { BrandCopy, Club } from "./types";

export const CLUB_COPY: BrandCopy = {
  maker: "Craft",
  product: "Klubbmerch",
  pickTitle: "Välj klubb.",
  pickSubtitle: "Vi hittar tillfällena. Du väljer motiven.",
  pickPlaceholder: "Sök klubb, t.ex. Blåvitt",
  pickEmpty: "Fler klubbar kommer. Just nu finns IFK Göteborg.",
  newsPlaceholder: "Klistra in länk till en nyhet om klubben",
  customPlaceholder: "Något eget? T.ex. 120-årsjubileum",
  org: "klubbens",
  listening: "Lyssnar av nyheter, matcher, poddar och väder för",
  shopName: "Klubbshoppen hos Intersport",
  shopSupport: "Tryckt på beställning · Varje köp stöttar klubben",
  logoWord: "sköld",
  loaderLines: [
    "Hela stadens lag",
    "Änglarna värmer upp…",
    "Kamraterna knyter skorna…",
    "Klacken stämmer upp på Gamla Ullevi…",
    "Blåvitt sedan 1904",
    "Kaffet är på i kansliet…",
    "Halsdukarna åker upp…",
    "Ränderna rättas till…",
  ],
  loaderDone: "Heja Blåvitt!",
  navLinks: true,
};

export const copyFor = (club: Pick<Club, "copy"> | null | undefined): BrandCopy => ({ ...CLUB_COPY, ...club?.copy });
