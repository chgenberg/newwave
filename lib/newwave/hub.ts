export type Payload = "tryckfiler" | "ordrar" | "offerter" | "produktdata" | "kunddata" | "material";

export const PAYLOADS: { id: Payload; label: string }[] = [
  { id: "tryckfiler", label: "Tryckfiler" },
  { id: "ordrar", label: "Ordrar" },
  { id: "offerter", label: "Offerter" },
  { id: "produktdata", label: "Produktdata och SKU" },
  { id: "kunddata", label: "Kunddata" },
  { id: "material", label: "Material och bilder" },
];

export type PortalId = "klubb" | "craft" | "new-wave" | "shop";

export type Leg = {
  id: string;
  n: string;
  angle: number;
  title: string;
  description: string;
  items: string[];
  payloads: Payload[];
  portals: PortalId[];
};

export const LEGS: Leg[] = [
  {
    id: "brand",
    n: "01",
    angle: -98,
    title: "Brand & Creative",
    description: "Läser in brandbook och logga, och tar fram design, mockups, tryckfiler och produktbilder inom varumärkets regler.",
    items: ["Brandbook och logga", "Design och mockups", "Tryckfiler", "Produktbilder"],
    payloads: ["tryckfiler", "material"],
    portals: ["klubb", "craft", "new-wave", "shop"],
  },
  {
    id: "content",
    n: "02",
    angle: -50,
    title: "Content & kampanj",
    description: "Planerar året kring högtider och klubbens egna datum, och skapar inlägg, nyhetsbrev, annonser och landningssidor.",
    items: ["Kalender och högtider", "Inlägg och nyhetsbrev", "Annonser", "Landningssidor"],
    payloads: ["material"],
    portals: ["klubb", "craft", "new-wave"],
  },
  {
    id: "produkt",
    n: "03",
    angle: 48,
    title: "Produkt & pris",
    description: "Håller sortiment, SKU, priser och marginaler för Craft och New Waves varumärken, och räknar kalkyler per kund.",
    items: ["Sortiment och SKU", "Priser och marginaler", "Kalkyler"],
    payloads: ["produktdata"],
    portals: ["craft", "new-wave", "shop"],
  },
  {
    id: "offert",
    n: "04",
    angle: 90,
    title: "Offert & sälj",
    description: "Bygger offerter med material och priser, för AI-dialog med kunden och samlar in storlekar och accept.",
    items: ["Offertverktyg", "AI-dialog", "CRM och sälj", "Storlekar och accept"],
    payloads: ["offerter", "ordrar", "kunddata"],
    portals: ["new-wave", "shop"],
  },
  {
    id: "kvalitet",
    n: "05",
    angle: 132,
    title: "Kvalitet & godkännande",
    description: "Granskar allt mot brand rules och rättigheter innan det går ut, och låter kunden godkänna direkt från mejlet.",
    items: ["Granskning", "Rättigheter", "Brand rules", "Godkänn via mejl"],
    payloads: ["tryckfiler", "material"],
    portals: ["klubb", "craft"],
  },
  {
    id: "ytor",
    n: "06",
    angle: 174,
    title: "Kundytor",
    description: "Varje roll får sin egen yta: klubben, Craft, New Wave och återförsäljaren – med samma data under.",
    items: ["Klubbens dashboard", "Crafts dashboard", "New Waves studio", "Återförsäljarens shop"],
    payloads: ["kunddata"],
    portals: ["klubb", "craft", "new-wave", "shop"],
  },
  {
    id: "insikt",
    n: "07",
    angle: -146,
    title: "Kundinsikt",
    description: "Samlar kunddata och beteenden och föreslår nästa affär – vilka klubbar som säljer och vilka som behöver hjälp.",
    items: ["Kunddata", "Beteenden", "Nästa affär"],
    payloads: ["kunddata"],
    portals: ["craft", "new-wave"],
  },
];

export type Actor = { id: string; name: string; sub: string; payloads: Payload[] };

export const ACTORS: Actor[] = [
  { id: "produktion", name: "Produktion och tryck", sub: "tar emot tryckfiler", payloads: ["tryckfiler", "ordrar"] },
  { id: "leverantorer", name: "Leverantörer", sub: "plagg och ämnen", payloads: ["ordrar", "produktdata"] },
  { id: "orderflode", name: "Orderflöde", sub: "order och status", payloads: ["ordrar", "offerter"] },
  { id: "frakt", name: "Frakt och logistik", sub: "bokning och spårning", payloads: ["ordrar", "kunddata"] },
  { id: "erp", name: "Ekonomi / ERP", sub: "faktura och avräkning", payloads: ["ordrar", "offerter", "kunddata"] },
  { id: "intersport", name: "Intersport", sub: "butiker och sortiment", payloads: ["produktdata", "material"] },
  { id: "webb", name: "Shop och webb", sub: "produkter online", payloads: ["produktdata", "material"] },
];

export type Portal = {
  id: PortalId;
  href: string;
  title: string;
  short: string;
  who: string;
  description: string;
  /** Dit valet på startsidan leder. */
  start: string;
  /** Visas i valet tills filmen finns. */
  poster: string;
  /** mp4 som spelas i valet, läggs in när filmen finns. */
  film?: string;
};

export const PORTALS: Portal[] = [
  {
    id: "klubb",
    short: "Klubb",
    href: "/newwave/klubb",
    title: "Klubbens dashboard",
    who: "För klubben",
    description: "Brandbook, kalender, färdigt material att godkänna och klubbens egen butik.",
    start: "/newwave/klubb",
    poster: "/newwave/portals/klubb.jpg",
  },
  {
    id: "craft",
    short: "Craft",
    href: "/newwave/craft",
    title: "Crafts dashboard",
    who: "För Craft",
    description: "Alla klubbar och allt material på ett ställe – med insikter och export till New Wave.",
    start: "/newwave/craft",
    poster: "/newwave/portals/craft.jpg",
  },
  {
    id: "new-wave",
    short: "New Wave",
    href: "/newwave/new-wave",
    title: "New Waves dashboard",
    who: "För New Wave",
    description: "Navet live: ordrar att trycka, återförsäljarnas webbshoppar och klubbarnas försäljning.",
    start: "/newwave/new-wave",
    poster: "/newwave/portals/new-wave.jpg",
  },
  {
    id: "shop",
    short: "Återförsäljare",
    href: "/newwave/shop",
    title: "Återförsäljarens shop",
    who: "För återförsäljaren",
    description: "Bygg er egen webbshop från er webbplats på en minut. Kunderna ser loggan på produkterna och beställer direkt.",
    start: "/newwave/shop/butiken/ny",
    poster: "/newwave/portals/shop.jpg",
  },
];

export type HubTarget = PortalId | "studio";

const PORTAL_ICON: Record<PortalId, string> = { klubb: "users", craft: "spark", "new-wave": "truck", shop: "store" };

/** Designmotorn och de fyra dashboardsen, i menyn som går att fälla ut till vänster. */
export const HUB_TARGETS: { id: HubTarget; href: string; title: string; short: string; who: string; icon: string }[] = [
  { id: "studio", href: "/newwave/studio", title: "Designmotorn", short: "Studio", who: "Designa med ert varumärke", icon: "drop" },
  ...PORTALS.map((p) => ({ id: p.id, href: p.href, title: p.title, short: p.short, who: p.who, icon: PORTAL_ICON[p.id] })),
];

/** Filmen som möter besökaren på förstasidan. */
export const HERO_VIDEO = { src: "/newwave/hero.mp4", poster: "/newwave/hero-poster.jpg" };
