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
    next: { text: "Kampanjen hamnar hos Åsa IF att godkänna.", label: "Öppna Åsa IF", href: "/newwave/klubb" },
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
      { label: "Bygg butiken från er webbadress", href: "/newwave/shop/butiken/ny" },
      { label: "Designa åt en kund", href: "/newwave/shop/designa" },
      { label: "Svara på en offert", href: "/newwave/shop/offerter" },
    ],
    next: { text: "Beställningar och godkända offerter blir ordrar hos New Wave.", label: "Öppna New Wave", href: "/newwave/new-wave/ordrar" },
  },
};
