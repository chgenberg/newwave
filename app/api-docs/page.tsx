import Link from "next/link";

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/clubs", what: "Sökbar lista över klubbar.", body: null },
  { method: "GET", path: "/api/v1/clubs/{clubId}", what: "Klubbens regelbok (färger, sköld, spärrade färger och ord) och produktkatalog.", body: null },
  {
    method: "GET",
    path: "/api/v1/signals?clubId=ifk-goteborg",
    what: "Signaler just nu: kommande högtider (60 dagar), säsong och trender från nyheter om klubben de senaste 14 dagarna. Negativa nyheter och spelarnamn filtreras bort.",
    body: null,
  },
  {
    method: "POST",
    path: "/api/v1/news",
    what: "Läser en nyhetsartikel från en länk (rubrik, ingress, brödtext, bild), avgör om den handlar om klubben och passar för merch, och gör om den till en signal utan spelarnamn. Interna adresser blockeras.",
    body: { clubId: "ifk-goteborg", url: "https://www.aftonbladet.se/sportbladet/fotboll/a/…" },
  },
  {
    method: "POST",
    path: "/api/v1/concepts",
    what: "6 motivförslag utifrån valda signaler. Varje förslag granskas av regelmotorn.",
    body: { clubId: "ifk-goteborg", signals: ["{ … från /signals … }"] },
  },
  {
    method: "POST",
    path: "/api/v1/artwork",
    what: "Ritar illustrationen, analyserar färgerna pixel för pixel, låter en AI-granskare kontrollera text, sköld, varumärken, personer och tryckbarhet, ritar om automatiskt (max 3 försök) och vektoriserar till SVG i enbart klubbens färger.",
    body: { clubId: "ifk-goteborg", concept: "{ … }" },
  },
  {
    method: "POST",
    path: "/api/v1/photos",
    what: "Fotorealistiska produktbilder med tryckfilen som referens: livsstil (säsong och högtid styr miljön) och produkt på läktarstol.",
    body: { clubId: "ifk-goteborg", concept: "{ … }", printFiles: { light: "/api/v1/files/…", dark: "/api/v1/files/…" } },
  },
  {
    method: "POST",
    path: "/api/v1/personalize",
    what: "Kontrollerar namn och nummer för ryggtryck mot klubbens spärrlista.",
    body: { clubId: "ifk-goteborg", name: "ELLA", number: "7" },
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/match-result",
    what: "Anropas vid slutsignal. Seger, eller oavgjort i derby, skapar 3 kontrollerade motiv och skickar sms till kansliet med länk för godkännande. Förlust skapar inget.",
    body: { clubId: "ifk-goteborg", opponent: "AIK", goalsFor: 2, goalsAgainst: 1, home: true, notifyTo: "+4670…" },
  },
  { method: "GET", path: "/api/v1/drops/{id}", what: "Ett drop som väntar på godkännande.", body: null },
  {
    method: "POST",
    path: "/api/v1/review",
    what: "Granskaragenten: betygsätter ett motiv eller produktfoto 1–10 i säljbarhet, realism, relevans och varumärkespassning enligt klubbagentens riktlinjer. Beslutet (publicera/underkänd) tas av gränsvärdena, inte av modellen.",
    body: { clubId: "ifk-goteborg", concept: "{ … }", imageUrl: "/api/v1/files/…", kind: "produktfoto" },
  },
  {
    method: "POST",
    path: "/api/v1/publish",
    what: "Publicerar bara granskningsgodkänt material till Intersports klubbshop via API (server till server med API-nyckel).",
    body: { clubId: "ifk-goteborg", dropId: "…", concept: "{ … }", photos: ["{ url, review }"], mockups: { "tee-white": "/api/v1/files/…" } },
  },
  {
    method: "POST",
    path: "/api/mock-intersport/v1/club-shops/{clubShopId}/products",
    what: "Simulerat Intersport-API (Bearer-nyckel). Byts mot Intersports riktiga API i produktion. Visas på /intersport/{clubId}.",
    body: { products: ["{ sku, title, description, priceSek, sizes, images, printFileUrl, fulfilment: 'print-on-demand' }"] },
  },
  {
    method: "POST",
    path: "/api/v1/content",
    what: "Texter för Instagram, Facebook, LinkedIn, TikTok, nyhetsbrev, hemsidebanner och TV samt publiceringsplan och Intersport-produkter för varje valt motiv.",
    body: { clubId: "ifk-goteborg", signals: ["…"], items: [{ concept: "{ … }", printFiles: { light: "data:image/png;base64,…", dark: "…" } }] },
  },
  { method: "GET", path: "/api/v1/files/{id}", what: "Hämtar en genererad fil.", body: null },
];

const PRODUCTION = [
  ["Trender", "Nyhetsflöde (Google News RSS) i mockupen. I skarp drift även matchdata, klubbens egna kanaler och lokala medier per ort."],
  ["Intersport", "POST /v1/club-shops/{clubShopId}/products skapar produkterna i klubbshoppen. Innehållet finns i intersport-produkter.json i zip-filen."],
  ["Order → tryck", "Intersport skickar order.created. Systemet slår upp SKU → tryckfil och skickar jobbet till tryckeriet."],
  ["Sociala medier", "Zip-filen till kansliet i dag. Nästa steg: publicera direkt via Publer-API:t."],
  ["Regelbok per klubb", "Färger, sköld, spärrade ord och licenser per klubb. Skölden hämtas från licensbiblioteket, aldrig från AI."],
  ["Affärssystem", "Artiklar och SKU:er synkas mot New Waves affärssystem för inköp, fakturering och provision till klubben."],
];

export default function ApiDocs() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="-my-3 inline-block py-3 text-sm font-medium text-[#234B9A] hover:underline">
        ← Tillbaka
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">API</h1>
      <p className="mt-2 text-[#86868B]">Samma API som gränssnittet använder. Intersport, en klubbportal eller en schemalagd bevakning kan anropa det direkt.</p>
      <div className="mt-8 space-y-3">
        {ENDPOINTS.map((e) => (
          <div key={e.path + e.method} className="min-w-0 rounded-3xl bg-[#F5F5F7] p-5 sm:p-6">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#234B9A]">{e.method}</span>
              <code className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{e.path}</code>
            </div>
            <p className="mt-2 text-[15px] text-[#3A3A3C] sm:text-sm">{e.what}</p>
            {e.body && (
              <pre className="mt-3 max-w-full overflow-auto rounded-2xl bg-[#1D1D1F] p-4 text-xs text-[#E8E8ED]">{JSON.stringify(e.body, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
      <h2 className="mt-12 text-2xl font-semibold tracking-tight">I produktion</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {PRODUCTION.map(([title, text]) => (
          <div key={title} className="rounded-3xl bg-[#F5F5F7] p-5">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-[15px] text-[#3A3A3C] sm:text-sm">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
