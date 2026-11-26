# POC: hela flödet från Crafts design till stickeriet och tryckeriet

Det Stefan vill se: Craft gör en design en gång, den blir varje klubbs egen med klubbens färger och märke, den säljs i
Intersports klubbshoppar, och en order går hela vägen – genom Crafts affärssystem till stickeriet eller tryckeriet,
med filerna – och status kommer tillbaka till Craft och kunden.

## Flödet, steg för steg

1. **Craft designar** (`/newwave/craft/…`): laddar upp en design (eller väljer en ordmallsdesign), väljer plagg ur
   katalogen och halsduken, väljer klubbar ur klubbregistret (alla 4 920, filter på sport, län, kommun, sök).
   Förhandsvisning per klubb med klubbens färger och märke. "Publicera till Intersport" skapar en klubbprodukt per
   klubb och plagg.
2. **Intersport säljer** (`/intersport/[clubId]`): klubbshoppen visar de publicerade klubbprodukterna. Kunden lägger i
   varukorgen och betalar (demobetalning). Kassan skickar ordern till plattformen: `POST /api/v1/orders`.
3. **Plattformen tar emot ordern**, sparar den i Postgres och skickar den till **Crafts affärssystem (simulerat)**, som
   bekräftar med ett eget ordernummer och delar ordern i produktionsjobb: halsdukar till stickeriet, plagg till
   tryckeriet.
4. **Producenterna hämtar jobben** via API (`/api/v1/producers/{producent}/jobs`) eller i sin egen kö
   (`/producent/{producent}`), laddar ner produktionsfilerna (stickfil BMP 240 × 1210 för halsduken, tryckfiler för
   plaggen – samma filer som i dag) och rapporterar status: accepterad → i produktion → skickad (med spårningsnummer).
5. **Status går tillbaka**: orderns status räknas ut från jobben. Craft ser alla ordrar och var de är
   (`/newwave/craft/ordrar`), kunden ser sin order (`/intersport/[clubId]/order/[id]`).

Allt som simuleras (Crafts affärssystem, betalningen, producenternas egna system) ligger bakom ett gränssnitt, så att
den riktiga kopplingen kan bytas in utan att resten ändras.

## Data (Postgres)

Lokalt: databasen `nextwave_poc` (`DATABASE_URL` i `.env.local`). I produktion: Postgres på Railway (`DATABASE_URL` är
redan satt på tjänsten). Tabellerna skapas av koden själv vid första anrop (idempotent `CREATE TABLE IF NOT EXISTS`),
så inget extra steg behövs vid driftsättning. Rör aldrig produktionsdatabasen under utvecklingen.

| Tabell | Innehåll |
| --- | --- |
| `designs` | Crafts design: namn, källa (uppladdad fil eller ordmall), konstverket (SVG/PNG som data eller URL), skapad |
| `club_products` | En design × klubb × plagg: titel, pris, mockup-URL, tryckspecifikation, status (`utkast`/`publicerad`) |
| `orders` | Order från en butik: ordernummer (`IS-100001`), kanal (`intersport`), klubb, kund, summa, status, affärssystemets ordernummer, åtkomstnyckel för kundens statussida |
| `order_lines` | Klubbprodukt, artikelnummer, titel, storlek, antal, styckpris, slag (`plagg`/`halsduk`) |
| `production_jobs` | Ett jobb per order och producent: producent (`tryckeri`/`stickeri`), status, raderna, spårningsnummer |
| `order_events` | Händelselogg för tidslinjen: order, jobb, vem (`butik`/`affärssystem`/`tryckeri`/`stickeri`/`craft`), vad, när |

Produktionsfilerna sparas inte: de byggs vid nedladdning ur klubbproduktens specifikation, med samma kod som i dag
(`lib/scarfProduction.ts` för halsduken, `lib/newwave/printFiles.ts` för plaggen).

## Kontraktet mellan delarna

Typerna ligger i `lib/poc/types.ts` och är det som alla delar bygger mot.

- `POST /api/v1/orders` – butiken skickar en order. Huvud `x-api-key` (`INTERSPORT_API_KEY`, demonyckel lokalt).
  Kropp: `{ clubId, customer: { name, email, phone?, address? }, lines: [{ clubProductId, size?, qty }] }`.
  Svar: `{ order, statusUrl }`. Priset tas alltid från klubbprodukten, aldrig från butiken.
- `GET /api/v1/orders/{id}?t={nyckel}` – en order med jobb och tidslinje, för kundens statussida.
- `GET /api/v1/orders?clubId=&status=` – Crafts ordervy.
- `GET /api/v1/producers/{producent}/jobs?status=` – producentens kö. Huvud `x-api-key` (en nyckel per producent).
- `GET /api/v1/producers/{producent}/jobs/{id}` och `…/jobs/{id}/files/{namn}` – jobbet och dess filer.
- `POST /api/v1/producers/{producent}/jobs/{id}/status` – `{ status, note?, tracking? }`.
- `GET /api/v1/catalog` – katalogen (platshållarplagg tills Robin skickat produktdata, plus halsduken).
- `POST /api/v1/craft/designs`, `POST /api/v1/craft/designs/{id}/publish` – `{ clubIds, skus }`.

### Funktioner mellan delarna (serversidan anropar dem direkt, utan HTTP)

- `lib/poc/store.ts` (A): `insertDesign`, `getDesign`, `listDesigns`, `upsertClubProducts(rader)` (unik på design ×
  klubb × artikel × variant), `getClubProduct`, `listClubProducts({ clubId?, designId?, status? })`, `listOrders({ clubId?,
  status? })`, `getOrderView(id)`, `listJobs(producer, status?)`, `getJob(id)`.
- `lib/poc/orders.ts` (A): `createOrder(ny: NewOrder) → { order: OrderView, token }`, `setJobStatus(producer, jobId,
  { status, note?, tracking? })`, `orderForCustomer(id, token)`.
- `lib/poc/catalog.ts` (B): `POC_CATALOG`, `catalogProduct(sku)`.
- `lib/poc/build.ts` (B): `clubProductDrafts(design, clubIds, skus)` → rader till `upsertClubProducts` (titel, pris,
  mockup-URL, `spec`), och `jobFiles(job, lines, products) → { name, label, data: Buffer }[]` som bygger
  produktionsfilerna ur `spec` – stickfilen för halsduken, tryckfilerna för plaggen.
- Butikens kassa anropar `createOrder` på serversidan (serveråtgärd eller egen route), så att butikens nyckel aldrig
  hamnar i webbläsaren. `POST /api/v1/orders` med nyckel är för externa butiker.
- Producentnycklar: `PRODUCER_KEY_TRYCKERI` och `PRODUCER_KEY_STICKERI` (demonycklar lokalt).

## Arbetsdelarna

Fyra delar som byggs samtidigt. Varje del äger sina filer; ingen ändrar en annan dels filer.

| Del | Vad | Äger |
| --- | --- | --- |
| A. Kärnan | Databasen, ordrar, det simulerade affärssystemet, producent-API:t | `lib/poc/db.ts`, `lib/poc/store.ts`, `lib/poc/orders.ts`, `lib/poc/erp.ts`, `app/api/v1/orders/**`, `app/api/v1/producers/**` |
| B. Craft | Katalogen, design → klubbar i bulk, produktionsfilerna, publicering, Crafts ordervy | `lib/poc/catalog.ts`, `lib/poc/build.ts`, `app/api/v1/catalog/**`, `app/api/v1/craft/**`, nya sidor under `app/newwave/craft/` (t.ex. `klubbkollektion/`, `ordrar/`), `components/poc/craft/**` |
| C. Butik och producenter | Intersports kassa mot riktiga ordrar, kundens orderstatus, stickeriets och tryckeriets köer | `app/intersport/**`, `components/newwave/clubshop/**`, `app/producent/**`, `components/poc/shop/**`, `components/poc/producer/**` |
| D. Klubbmärken | Högupplösta märken och rätt färger för hela registret | `scripts/club-logos-hd.mjs`, `.data/newwave/clubs/logos-hd/` |

`lib/poc/types.ts` är gemensam: ändra den bara genom att lägga till valfria fält, och skriv i så fall det i rapporten.

## Klart när

En genomkörning utan handpåläggning:

1. Craft skapar en design och publicerar den till tre klubbar, med en t-shirt, en hoodie och halsduken.
2. I en av klubbarnas Intersport-shop syns produkterna i klubbens färger med klubbens märke.
3. En kund köper en halsduk och en t-shirt. Ordern får ett ordernummer och en statussida.
4. Ordern syns i Crafts ordervy med affärssystemets ordernummer och två jobb.
5. Stickeriet ser halsduksjobbet och laddar ner stickfilen (samma format som stickeriet godkänt), tryckeriet ser
   t-shirtjobbet och laddar ner tryckfilerna.
6. Producenterna markerar sina jobb som skickade med spårningsnummer. Kundens statussida och Crafts vy visar "skickad".

## Steg 2: det som återstod efter första genomkörningen

| Del | Vad |
| --- | --- |
| A. Kärnan och säkerheten | Inloggning per roll (Craft, stickeriet, tryckeriet) med lösenord och signerad sessionscookie; Crafts order-API och sidor låsta; frakten räknas på servern och ingår i ordern; Craft kan avbryta en order som inte börjat tillverkas; nytt försök mot affärssystemet (automatiskt och på knapp); kunden kan slå upp sin order med ordernummer och e-post |
| B. Craft | Halsduken följer designen; plaggets färg per klubb (automatiskt efter kontrast, går att ändra); förlopp när många klubbar publiceras; import av Crafts riktiga produktdata när den kommer; knappar i ordervyn för att avbryta och försöka igen mot affärssystemet |
| C. Butik och producenter | Leveransadressen och kunden i producentens kö; rapportera fel och ta upp ett jobb igen; producenterna loggar in med lösenord; frakten skickas med ordern; kunden hittar sin order med ordernummer och e-post; avbruten order visas rätt |

Nya funktioner från A (signaturerna i `lib/poc/auth.ts` och `lib/poc/orders.ts`):

- `auth.ts` – inloggning per roll (`Role`: `"craft" | "stickeri" | "tryckeri"`). Sessionen är en cookie
  (`nw-poc-session`) signerad med HMAC-SHA256, httpOnly, sameSite lax, secure i produktion. Varje roll gäller i 12
  timmar, och en session kan bära flera roller (Craft och stickeriet i samma webbläsare).
  - `login(role, password): Promise<boolean>` och `logout(role?): Promise<Role[]>` (utan roll loggas alla ut; ger
    rollerna som är kvar). Bara i serveråtgärder och routes, eftersom de skriver cookien.
  - `currentRoles(): Promise<Role[]>`, `hasRole(role): Promise<boolean>`.
  - `requireRole(role, next?): Promise<void>` – för sidor: skickar till `/logga-in?roll=<roll>&next=<next>` om rollen
    saknas. Utan `next` används rollens startsida (`ROLE_HOME`).
  - `roleFromRequest(req, role): Promise<"session" | "nyckel" | null>` – för routes: sessionen, eller för
    producenterna `x-api-key`.
  - `loginPath(role, next?)`, `internalPath(raw)` (bara sökvägar på sajten, annars null), `isRole`, `ROLES`,
    `ROLE_NAME` ("Craft", "stickeriet", "tryckeriet"), `ROLE_HOME`, `keyOk(given, want)` (jämförelse i konstant tid),
    `producerKeyOk(producer, key)` (finns kvar även i `orders.ts`).
  - Inloggningssidan `/logga-in?roll=<roll>&next=<sida>` (`app/logga-in`). Utloggning: serveråtgärden `logoutAction`
    ur `app/logga-in/actions.ts` i ett formulär med de dolda fälten `roll` och `next`, eller `POST /api/v1/poc/logga-ut`
    (formulär eller `?roll=&next=`; med `next` 303 dit, annars `{ roles }`).
  - Miljön: `CRAFT_PASSWORD`, `STICKERI_PASSWORD`, `TRYCKERI_PASSWORD` (lokalt `demo-craft`, `demo-stickeri`,
    `demo-tryckeri`) och `POC_SESSION_SECRET`. I produktion loggas en varning när demovärdena används.
- `orders.ts`:
  - `createOrder(ny)` tar `delivery` (`DeliveryId`: `ombud`, `hem`, `butik`; utan den kassans förval `ombud`). Frakten
    räknas på servern med `shipping()` ur `components/newwave/clubshop/pricing.ts`, sparas i `order.shipping`
    (`{ method, label, priceSek }`) och ingår i `totalSek`. Okänt leveranssätt ger 400.
  - `cancelOrder(id, reason?): Promise<OrderView>` – id eller ordernummer. Bara när inget jobb är i produktion eller
    skickat, annars `PocError` 409 med beskedet (t.ex. "stickeriet har redan börjat sticka"). Ordern får status
    `avbruten` och `cancelReason`, jobben status `fel` med anteckningen `CANCELLED_NOTE` ("Ordern avbruten av Craft"),
    och producenterna kan inte ta upp dem igen (409).
  - `retryErp(id): Promise<OrderView>` – för en order som är `mottagen`. 409 om den redan är bekräftad eller avbruten,
    502 om affärssystemet fortfarande inte svarar. `createOrder` gör själv två nya försök (efter 0,3 och 1 s); lyckas
    inget stannar ordern på `mottagen` med en händelse. `ERP_SIMULATE_FAIL=1` får det simulerade affärssystemet att
    fallera.
  - `findOrderForCustomer(number, email): Promise<string | null>` – statussidans sökväg (`customerStatusPath`) eller
    null. Numret som `IS-100001`, `is 100001` eller `100001`; e-posten utan hänsyn till stora och små bokstäver; samma
    svar oavsett om numret finns. Anroparen begränsar antalet försök.
  - `setJobStatus` sparar `note` i `ProductionJob.note` (en ny status utan anteckning tömmer den).
  - `JobView` har också `orderStatus`.
- Nya routes (Craft kräver sessionen): `POST /api/v1/orders/{id}/cancel` (`{ reason? }`), `POST
  /api/v1/orders/{id}/retry-erp`, `POST /api/v1/orders/lookup` (`{ number, email }` med butikens `x-api-key` →
  `{ statusUrl }` eller 404). `GET /api/v1/orders` kräver Crafts session eller butikens nyckel. Producent-API:t tar
  producentens session eller `x-api-key`.
- Databasen: `orders.shipping`, `orders.cancel_reason` och `production_jobs.note` läggs till med
  `ADD COLUMN IF NOT EXISTS`, så att befintlig data finns kvar.

## Steg 3: det Stefan bad om i mötet och som saknades

| Del | Vad | Äger |
| --- | --- | --- |
| D. Sortiment och shoppar | Olika designer till olika klubbar (fördelas så att grannklubbar inte får samma, går att ändra per klubb) och varianter för smeknamn, ort och stadsdel; sweatshirt och joggingbyxor i katalogen; Craft tar bort och lägger till produkter i en klubbs shop | `lib/poc/catalog.ts`, `lib/poc/build.ts`, `lib/poc/store.ts`, `lib/poc/db.ts`, `app/api/v1/craft/**` utom `innehall/` och `sasong/`, `app/newwave/craft/klubbkollektion/**`, ny `app/newwave/craft/shoppar/**`, `components/poc/craft/**` utom `content/` och `season/`, `public/poc/plagg/**` |
| E. Innehåll och säsonger | Miljöbild per klubbprodukt (bara när Craft ber om den); innehållspaket till sociala medier och mejlutkast till klubben när produkter publiceras (sparas som utkast, skickas aldrig automatiskt); säsongerna i kampanjkalendern kopplade till klubbkollektionen, med planerad publicering | ny `lib/poc/content.ts`, ny `lib/poc/seasons.ts`, `app/api/v1/craft/innehall/**`, `app/api/v1/craft/sasong/**`, nya `app/newwave/craft/utskick/**` och `app/newwave/craft/sasonger/**`, `components/poc/craft/content/**`, `components/poc/craft/season/**`, `components/poc/shop/ClubProductView.tsx` och `ClubProducts.tsx` (miljöbilden i shoppen) |

Kontraktet mellan D och E:
- Klubbkollektionen (D) läser förval ur adressen: `?mall=<ordmall>&design=<designId>&produkter=<sku,sku>&namn=<designnamn>&sport=&lan=&kommun=&sasong=<id>` och visar säsongen överst när `sasong` finns.
- Efter varje omgång som publiceras anropar klubbkollektionen (D), om rutan "Skapa innehåll och mejlutkast till klubbarna" är ikryssad, `POST /api/v1/craft/innehall` med `{ designId, clubIds }` (högst 250 klubbar) och visar hur många utkast som skapats. E bygger routen.
- Miljöbilden: `POST /api/v1/craft/innehall/miljobild` med `{ clubProductId }` ger `{ url }`. E sparar den i en egen tabell och visar den i shoppens produktvy.
- Varje del skapar sina egna tabeller idempotent med `query` ur `lib/poc/db.ts`; E rör inte `db.ts` eller `store.ts`.

## Att koppla in de riktiga systemen

Det som simuleras i POC:n sitter bakom gränssnitt, och flödets API:er går att nå utan demolösenordet (de kontrollerar
själva nyckel eller inloggning, se `lib/access.ts`).

| System | Kopplas in | Behövs från dem |
| --- | --- | --- |
| New Waves affärssystem och API-hubb | `erp()` i `lib/poc/erp.ts` – en egen `ErpAdapter` i stället för den simulerade | API-beskrivning; att samma order skickad två gånger (nytt försök) inte blir två ordrar; ett anrop för att avbryta |
| Intersports klubbshoppar | Ordrar in: `POST /api/v1/orders` (nyckel `INTERSPORT_API_KEY`). Produkter ut: publiceringen i `lib/poc/build.ts`/`store.ts` skickas vidare till deras produkt-API | Deras produkt-API och hur ordrar och betalning kommer tillbaka |
| Tryckeriet och stickeriet | Hämtar jobb och filer: `/api/v1/producers/{tryckeri,stickeri}/jobs` (nycklar `PRODUCER_KEY_*`), eller köerna på `/producent` med lösenord – om de inte nås via New Waves hubb | Om de vill hämta själva eller få jobben skickade (webhook) |
| Crafts produktdata | `scripts/poc-import-catalog.ts` → `lib/poc/catalog-data.json` | Artikelnummer, namn, pris, storlekar, färger (från Robin) |
| Säsongsschemat | `POST /api/v1/craft/sasong/kor` en gång i timmen (nyckel `CRAFT_SEASON_KEY`) | – |

Miljövariabler i produktion: `DATABASE_URL`, `CRAFT_PASSWORD`, `STICKERI_PASSWORD`, `TRYCKERI_PASSWORD`,
`POC_SESSION_SECRET`, `PRODUCER_KEY_STICKERI`, `PRODUCER_KEY_TRYCKERI`, `INTERSPORT_API_KEY`, `CRAFT_SEASON_KEY`.

## Regler för bygget

- Next.js 16 skiljer sig från tidigare versioner: läs guiden i `node_modules/next/dist/docs/` innan kod skrivs.
- Gränssnitt, kommentarer och texter på svenska. Följ hur befintliga sidor ser ut och är byggda.
- Ingen commit och ingen push – Christopher bestämmer när något går ut (push till `main` driftsätter).
- En gemensam utvecklingsserver kör på `http://localhost:3300`. Starta ingen egen och kör inte `next build`.
  Kontrollera typerna med `npx tsc --noEmit` och lint med `npx eslint <filer>`.
- Inga modellanrop i flödet (det ska gå att visa gratis och utan väntan).
