/** Den guidade demons steg, i visningens ordning. Adressen beror på det demon gjort hittills (klubbarna, ordern). */

export type DemoState = {
  step: number;
  startedAt: string;
  clubIds?: string[];
  orderId?: string;
  number?: string;
  statusPath?: string;
  jobs?: Partial<Record<"tryckeri" | "stickeri", string>>;
};

export type DemoAction = "publicera" | "order" | "tryckeri" | "stickeri";

export type DemoStep = { title: string; text: string; url: (s: DemoState) => string; action?: DemoAction };

export const DEMO_KEY = "nw-demo";
export const DEMO_START = "/newwave/demo";

const shop = (s: DemoState) => `/intersport/${s.clubIds?.[0] ?? "linghems-sportklubb"}`;

export const DEMO_STEPS: DemoStep[] = [
  {
    title: "Craft gör kollektionen",
    text: "Craft väljer designer, plagg och klubbar och publicerar till klubbarnas Intersport-shoppar. Knappen publicerar tre ordmallar till tre klubbar i Linköping – grannklubbarna får olika tryck. Ni kan också göra det själva i stegen på sidan.",
    url: () => "/newwave/craft/klubbkollektion",
    action: "publicera",
  },
  {
    title: "Klubbarnas shoppar",
    text: "Kollektionen ligger nu i varje klubbs shop. Här tar Craft bort och lägger till produkter och ändrar priset per klubb.",
    url: () => "/newwave/craft/shoppar",
  },
  {
    title: "Kunden handlar i shoppen",
    text: "Linghems SK:s shop hos Intersport, med klubbens namn, färger och märke. Knappen lägger Stefans provorder – t-shirt, hoodie, softshelljacka och halsduk, hämtas i butik. Ni kan också handla själva; inga pengar dras.",
    url: shop,
    action: "order",
  },
  {
    title: "Craft ser ordern",
    text: "Affärssystemet har bekräftat ordern med sitt eget ordernummer och delat den: plaggen till tryckeriet och halsduken till stickeriet.",
    url: (s) => (s.orderId ? `/newwave/craft/ordrar/${s.orderId}` : "/newwave/craft/ordrar"),
  },
  {
    title: "Tryckeriet",
    text: "Tryckeriets kö med kundens adress, fraktsedel, tryckfiler, korrektur och arbetsorder. Knappen för jobbet ett steg i taget – eller tryck i kön.",
    url: (s) => `/producent/tryckeri${s.number ? `#${s.number}` : ""}`,
    action: "tryckeri",
  },
  {
    title: "Stickeriet",
    text: "Stickeriets kö: stickfilen i det format stickeriet har godkänt, med stickorder och garnlista. Knappen för jobbet ett steg i taget.",
    url: (s) => `/producent/stickeri${s.number ? `#${s.number}` : ""}`,
    action: "stickeri",
  },
  {
    title: "Kunden ser sin order",
    text: "Kundens statussida: var ordern är, och spårningsnumren när den är skickad.",
    url: (s) => s.statusPath ?? `${shop(s)}/order/hitta`,
  },
  {
    title: "Innehåll till klubben",
    text: "När kollektionen publicerades fick varje klubb ett innehållspaket – inlägg, story och affisch med QR-kod – och ett mejlutkast till föreningens adress. Inget skickas automatiskt.",
    url: () => "/newwave/craft/utskick",
  },
  {
    title: "Säsonger",
    text: "Kampanjkalendern: regnperiod, jul, cupsäsong. En säsong ger förslag på plagg och design, och kollektionen kan planeras till rätt dag eller upprepas från förra säsongen.",
    url: () => "/newwave/craft/sasonger",
  },
  {
    title: "Klubbmärkena",
    text: "Klubbregistret med 4 920 föreningar. Överst de 2 811 märken som ritats om som vektor och godkänts för tryck.",
    url: () => "/newwave/klubbregistret",
  },
  {
    title: "Kopplingen mot New Waves hubb",
    text: "Ordrarna på väg ut till affärssystemet, och status, lager och produkter som kommer tillbaka. Simulerad tills New Waves hubb kopplas in.",
    url: () => "/newwave/craft/integration",
  },
];

/** Knappen för producentens nästa steg, efter jobbets status. */
export const NEXT_LABEL: Record<string, string | null> = { ny: "Acceptera", accepterad: "I produktion", "i produktion": "Markera som skickad", skickad: null, fel: null };
