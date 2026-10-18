import type { PortalId } from "./hub";

export type GuideStep = { label: string; href: string };

/** Ett steg räknas som provat när man varit på sidan; undersidor räknas också, utom under ingångens startsida. */
export const visited = (step: GuideStep, pathname: string) => pathname === step.href || (step.href.split("/").length > 3 && pathname.startsWith(`${step.href}/`));

/** Tre saker att prova i varje ingång, och vart kedjan tar vägen sedan – för den som fått länken och testar själv. */
export const GUIDES: Record<PortalId, { role: string; steps: GuideStep[]; next: { text: string; label: string; href: string } }> = {
  klubb: {
    role: "Ni är kansliet i Åsa IF",
    steps: [
      { label: "Granska veckans material", href: "/newwave/klubb/material/veckan" },
      { label: "Designa en egen tröja", href: "/newwave/klubb/designa" },
      { label: "Se klubbens butik", href: "/newwave/klubb/butik" },
    ],
    next: { text: "Craft ser alla klubbar och skickar kampanjer hit.", label: "Öppna Craft", href: "/newwave/craft" },
  },
  craft: {
    role: "Ni driver klubbmerch för alla föreningar",
    steps: [
      { label: "Se hur klubbarna mår", href: "/newwave/craft" },
      { label: "Planera en kampanj", href: "/newwave/craft/skapa" },
      { label: "Se vad som säljer", href: "/newwave/craft/insikter" },
    ],
    next: { text: "Kampanjen hamnar hos Åsa IF att godkänna.", label: "Öppna Åsa IF", href: "/newwave/klubb/oversikt" },
  },
  merch: {
    role: "Ni är supporter och vill ha klubbens merch",
    steps: [
      { label: "Hitta din klubb och en produkt", href: "/newwave/merch" },
      { label: "Öppna en klubbs egen sida", href: "/newwave/merch/asa-if" },
      { label: "Se hur klubben skapar motiven", href: "/newwave/klubb" },
    ],
    next: { text: "Motiven kommer från klubbarnas veckomaterial.", label: "Öppna Åsa IF", href: "/newwave/klubb" },
  },
  "new-wave": {
    role: "Ni producerar och levererar",
    steps: [
      { label: "Se allt som händer just nu", href: "/newwave/new-wave" },
      { label: "Starta en order", href: "/newwave/new-wave/ordrar" },
      { label: "Se återförsäljarnas butiker", href: "/newwave/new-wave/aterforsaljare" },
    ],
    next: { text: "Ordrarna kommer från återförsäljarnas butiker.", label: "Bli återförsäljare", href: "/newwave/shop/butiken/ny" },
  },
  shop: {
    role: "Ni är återförsäljare av profilprodukter",
    steps: [
      { label: "Handla som företag i butiken", href: "/newwave/s/vastkust-profil" },
      { label: "Redigera butiken", href: "/newwave/shop/butiken" },
      { label: "Svara på en offert", href: "/newwave/shop/offerter" },
    ],
    next: { text: "Beställningar och godkända offerter blir ordrar hos New Wave.", label: "Öppna New Wave", href: "/newwave/new-wave/ordrar" },
  },
};

export type PageHelp = { path: string; title: string; text?: string; steps?: { title: string; text: string }[] };

/** Förklaringar som hör till en viss sida och visas i hjälpen när man står där. */
export const PAGE_HELP: PageHelp[] = [
  {
    path: "/newwave/shop",
    title: "Kunden designar och beställer",
    text: "Företagskunden laddar upp sin logga i er butik och beställer direkt till ert pris, eller begär offert som ni granskar och skickar. Ordern går till New Wave, som trycker och levererar i ert namn.",
  },
  {
    path: "/newwave/shop/butiken",
    title: "Så handlar ett företag i butiken",
    text: "Allt ser ut som er butik. Plattformen syns inte för kunden.",
    steps: [
      { title: "Väljer produkt eller event", text: "En enskild produkt, eller ett tillfälle som mässa, kick-off eller julklapp där hela kollektionen sätts ihop åt kunden." },
      { title: "Lägger in sin logga", text: "Laddar upp filen, hämtar den från sin webbplats eller laddar upp sin grafiska profil. Den syns direkt på allt." },
      { title: "Designar i 3D och ser priset", text: "Samma designmotor som ni har. Ert påslag och mängdrabatten räknas in medan kunden väljer antal." },
      { title: "Beställer eller begär offert", text: "Direkt till ert pris, eller som offert ni svarar på. Ordern går till New Wave, som trycker och skickar i ert namn." },
    ],
  },
  {
    path: "/newwave/klubb/butik",
    title: "Så väljs produkterna",
    text: "Agenten väljer produkter efter tillfällets säsong och aktivitet: mössa och termos till vintern, keps och picknickfilt till sommaren. Vill ni göra en egen? Tryck Designa på en produkt, så lägger ni den i butiken direkt.",
  },
];
