export type Payload = "tryckfiler" | "ordrar" | "offerter" | "produktdata" | "kunddata" | "material";

export const PAYLOADS: { id: Payload; label: string; description: string }[] = [
  { id: "tryckfiler", label: "Tryckfiler", description: "Färdiga produktionsfiler per tryckposition – PNG i 300 dpi, SVG och brodyrfil – med Pantone, mått och kontrollsumma." },
  { id: "ordrar", label: "Ordrar", description: "Beställningar från klubbarnas butiker och återförsäljarna, med storlekar, antal och leveransadress." },
  { id: "offerter", label: "Offerter", description: "Godkända offerter med produkter, märkning, priser och kundens accept." },
  { id: "produktdata", label: "Produktdata och SKU", description: "SKU, plaggfärg, tryckmetod och pris för varje produkt, så att New Wave kan plocka och trycka rätt." },
  { id: "kunddata", label: "Kunddata", description: "Klubb, återförsäljare och kontaktuppgifter – det som behövs för frakt och faktura." },
  { id: "material", label: "Material och bilder", description: "Mockups, produktbilder och texter till butikerna, Intersport och webben." },
];

export type PortalId = "klubb" | "craft" | "merch" | "shop" | "new-wave";

export type Leg = {
  id: string;
  n: string;
  angle: number;
  title: string;
  description: string;
  items: string[];
  payloads: Payload[];
  portals: PortalId[];
  /** Var benet syns i demot. */
  demo?: { href: string; label: string };
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
    demo: { href: "/newwave/studio", label: "Öppna designmotorn" },
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
    demo: { href: "/newwave/klubb", label: "Se veckans material skapas" },
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
    demo: { href: "/newwave/merch", label: "Se all klubbmerch" },
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
    demo: { href: "/newwave/shop", label: "Öppna återförsäljarens offerter" },
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
    demo: { href: "/newwave/klubb/oversikt", label: "Se klubbens godkännanden" },
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
    demo: { href: "/newwave/craft", label: "Öppna Crafts insikter" },
  },
];

export type Actor = { id: string; name: string; sub: string; description: string; payloads: Payload[]; demo?: { href: string; label: string } };

export const ACTORS: Actor[] = [
  {
    id: "produktion",
    name: "Produktion och tryck",
    sub: "tar emot tryckfiler",
    description: "Tryckeri, brodyr, laser, sublimering och stickeri får filerna i det format maskinen läser, i exakt tryckstorlek.",
    payloads: ["tryckfiler", "ordrar"],
    demo: { href: "/newwave/new-wave/tryckfiler", label: "Se tryckfilerna som kommit in" },
  },
  { id: "leverantorer", name: "Leverantörer", sub: "plagg och ämnen", description: "Plagg och ämnen beställs utifrån ordrarnas SKU, färg och storlek.", payloads: ["ordrar", "produktdata"] },
  {
    id: "orderflode",
    name: "Orderflöde",
    sub: "order och status",
    description: "Varje order följs från mottagen till skickad, och statusen går tillbaka till navet.",
    payloads: ["ordrar", "offerter"],
    demo: { href: "/newwave/new-wave/ordrar", label: "Se ordrarna hos New Wave" },
  },
  { id: "frakt", name: "Frakt och logistik", sub: "bokning och spårning", description: "Frakten bokas med kundens adress, och spårningen skickas till kunden.", payloads: ["ordrar", "kunddata"] },
  { id: "erp", name: "Ekonomi / ERP", sub: "faktura och avräkning", description: "Fakturor, avräkning mot klubbar och återförsäljare, och provision per såld produkt.", payloads: ["ordrar", "offerter", "kunddata"] },
  { id: "intersport", name: "Intersport", sub: "butiker och sortiment", description: "Klubbarnas produkter läggs upp i Intersports klubbshop med bilder och texter.", payloads: ["produktdata", "material"] },
  { id: "webb", name: "Shop och webb", sub: "produkter online", description: "Merch-listan, Intersport och återförsäljarnas webbshoppar får produktdata och bilder.", payloads: ["produktdata", "material"], demo: { href: "/newwave/merch", label: "Se all klubbmerch" } },
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
    href: "/newwave/klubb/oversikt",
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
    id: "merch",
    short: "Merch-butik",
    href: "/newwave/merch",
    title: "All klubbmerch",
    who: "För supportrarna",
    description: "Alla klubbar och all deras merch i en lista, med en sida per klubb. Filtrera på klubb, sport och produkt – och köp i klubbens butik hos Intersport.",
    start: "/newwave/merch",
    poster: "/newwave/portals/merch-butik.jpg",
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

/** New Waves hub i demot: inte en ingång, men sidorna visar det New Wave tar emot – ordrar och tryckfiler. */
export const NEW_WAVE_HUB = { id: "new-wave", short: "New Waves hub", href: "/newwave/new-wave" } as const;

export type HubTarget = PortalId | "studio";

const PORTAL_ICON: Record<PortalId, string> = { klubb: "users", craft: "spark", merch: "bag", shop: "store", "new-wave": "truck" };

/** Designmotorn och de fyra ingångarna, i menyn som går att fälla ut till vänster. */
export const HUB_TARGETS: { id: HubTarget; href: string; title: string; short: string; who: string; icon: string }[] = [
  { id: "studio", href: "/newwave/studio", title: "Designmotorn", short: "Studio", who: "Designa med ert varumärke", icon: "drop" },
  ...PORTALS.map((p) => ({ id: p.id, href: p.href, title: p.title, short: p.short, who: p.who, icon: PORTAL_ICON[p.id] })),
];

export const targetShort = (id: HubTarget) => (id === NEW_WAVE_HUB.id ? NEW_WAVE_HUB.short : HUB_TARGETS.find((t) => t.id === id)?.short);

/** Rutorna i kartan över hur navet talar med New Waves hub. */
export const HUB_NODES = {
  core: {
    kicker: "Vår plattform · isolerad",
    title: "Next Wave Commerce Hub",
    description:
      "Navet. AI-orkestreraren styr de sju benen, och alla delar samma datalager: varumärken, produkter, kunder och material. Allt byggs här, isolerat, utan att röra New Waves system.",
    items: ["AI Orchestrator", "Delat datalager", "Sju ben som arbetar parallellt"],
  },
  api: {
    kicker: "Den enda kopplingen",
    title: "HUB-API · REST + webhooks",
    description:
      "Det som är klart skickas som ett API-anrop med filer, SKU och kontrollsummor. New Waves hub svarar 201 Created och skickar sedan status tillbaka via webhooks: mottaget, i produktion, skickat.",
    items: ["POST /v1/print-jobs", "POST /v1/orders", "Webhooks för status"],
  },
  profile: {
    kicker: "New Wave Profile · utanför vår plattform",
    title: "New Wave Profile hub",
    description: "New Waves egen hub tar emot paketen och fördelar dem vidare till produktion, leverantörer, ekonomi och butiker. Den finns redan och behöver inte byggas om.",
    items: ["Tar emot paket", "Fördelar till rätt mottagare", "Svarar med status"],
  },
} as const;

/** Filmen som möter besökaren på förstasidan. */
export const HERO_VIDEO = { src: "/newwave/hero.mp4", poster: "/newwave/hero-poster.jpg" };
