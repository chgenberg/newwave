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
- `lib/poc/catalog.ts` (B): `pocCatalog()` (läses om när hubben ändrat katalogen), `catalogProduct(sku)`, `sellable(sku)`.
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

## Steg 4: kopplingen mot New Waves hubb, åt båda hållen

Målet: när New Wave lämnar API-beskrivning och nyckel ska bara miljövariablerna sättas och översättningen till hubbens
fältnamn skrivas – ut i `lib/poc/hub/mapping.ts`, in i `lib/poc/hub/mapping-in.ts`. Allt annat är byggt, provat mot en
provhubb och dokumenterat. Tills dess är hubbens format detsamma som våra typer i `lib/poc/hub/types.ts`.

Miljövariabler:

| Variabel | Vad |
| --- | --- |
| `HUB_MODE` | `simulerad` (standard: svarar själv, som i dag) eller `http` |
| `HUB_API_URL`, `HUB_API_KEY` | Hubbens adress och nyckel |
| `HUB_AUTH_HEADER` | Rubriken som bär nyckeln; standard `Authorization` med `Bearer <nyckel>` |
| `HUB_WEBHOOK_SECRET` | Hemligheten för signaturen (HMAC-SHA256) på hubbens händelser till oss |
| `HUB_CRON_KEY` | Nyckeln för schemat som kör utkorgen och hämtningen (`POST /api/v1/hub/kor`) |
| `HUB_PULL` | `1`: vi hämtar lager och produkter själva, om hubben inte skickar händelser |
| `HUB_FILE_TTL_H` | Hur många timmar fillänkarna till hubben gäller (standard 336, två veckor) |
| `PUBLIC_BASE_URL` | Sajtens adress i länkarna till hubben (standard `https://www.nextwaveproduction.se`) |
| `HUB_TIMER` | `0`: timern i serverprocessen (`instrumentation.ts`) som kör utkorgen varje minut stängs av; då måste schemat anropa `/api/v1/hub/kor` |
| `ALERT_WEBHOOK_URL` | Larm, t.ex. en Slack-webhook; utan den skrivs larmen bara i loggen |

| Del | Vad | Äger |
| --- | --- | --- |
| Ut | `HubClient` (simulerad och http), utkorgen med nya försök och larm, ordrar och avbokningar till hubben, butikens ordernummer (`externalRef`) så att samma order aldrig blir två, tidsbegränsade fillänkar, schemats route, hubbens status in i ordern | `lib/poc/hub/client.ts`, `mapping.ts`, `outbox.ts`, `files.ts`, `alert.ts`, `config.ts`, `lib/poc/erp.ts`, `lib/poc/orders.ts`, `lib/poc/store.ts`, `lib/poc/db.ts`, `lib/poc/types.ts`, `lib/access.ts`, `instrumentation.ts`, `app/api/v1/hub/kor/**`, `app/api/v1/hub/filer/**`, `app/api/v1/orders/**`, `app/newwave/craft/ordrar/**`, `components/poc/craft/Order*.tsx`, `components/poc/craft/orderParts.tsx` |
| In | Ingången för hubbens händelser (signatur, att samma händelse bara behandlas en gång, fördelning), översättningen in, provhubben, testet av hela kretsen, API-dokumentationen (OpenAPI) och Crafts integrationssida | `lib/poc/hub/inbox.ts`, `mapping-in.ts`, `app/api/v1/hub/webhook/**`, `app/api/v1/hub/openapi/**`, `docs/hubb-api.yaml`, `scripts/hub-mock.mjs`, `scripts/hub-e2e.mjs`, `app/newwave/craft/integration/**`, `components/poc/craft/integration/**` |
| Lager och produkter | Lagersaldo och produkter från hubben, katalogen som uppdateras medan servern kör, lagret i shoppen, kassan och Crafts vyer | `lib/poc/hub/stock.ts`, `lib/poc/hub/products.ts`, `lib/poc/catalog.ts` och katalogens anropsställen, `components/poc/shop/**`, `app/intersport/**`, `app/newwave/craft/shoppar/**`, `app/newwave/craft/klubbkollektion/**`, `components/poc/craft/**` utom `integration/` och orderfilerna |
| Drift | Rensning av personuppgifter, rensning av demodatan, miljöbildens kostnad ur verkliga tokens, driftbeskrivning | `lib/poc/privacy.ts`, `scripts/poc-rensa-demodata.ts`, `lib/poc/content.ts`, `docs/drift.md`, `app/api/v1/poc/rensa/**` |

Funktionerna mellan delarna (namnen är bestämda; signaturerna får förfinas av ägaren):
- Ut → In: `applyOrderStatus(data)` i `lib/poc/orders.ts` (data som i händelsen `order.status`) uppdaterar order, jobb
  och tidslinje och ger `{ ok, message? }`; `processOutbox()` och `outboxSummary()` i `outbox.ts`; `hub()` och
  `hubConfig()` (läge, adress, vad som saknas – aldrig nyckeln) i `client.ts`/`config.ts`; `alert(key, text)` i `alert.ts`.
- Lager och produkter → In och Ut: `applyStock(items, full?)`, `stockFor(sku)`, `checkStock(lines)` (ger
  `{ ok, problems }`; Ut anropar den i `createOrder`), `reserveStock(lines)` (Ut anropar den när hubben bekräftat) i
  `stock.ts`; `applyProducts(products)`, `deleteProducts(skus)` i `products.ts`; `pocCatalog()` i `catalog.ts`
  ersätter konstanten `POC_CATALOG` (synkron, läser om katalogen när hubben ändrat den).
- In → alla: `recordEvent(event)` och `eventSummary()` i `inbox.ts`; In anropar `applyOrderStatus`, `applyStock`,
  `applyProducts` och `deleteProducts`.
- Varje del skapar sina egna tabeller idempotent med `query` ur `lib/poc/db.ts` (som `q` i `lib/poc/content.ts`); bara Ut ändrar `db.ts` och `store.ts`.
- Utan lagersaldo för en artikel säljs den som i dag (obegränsat). Saknas en storlek i ett fullständigt lager är den slut.

Provning: två utvecklingsservrar kan inte köra i samma mapp, och den på 3300 kör med `.env.local` i simulerat läge.
Hubbläget (`http`) provas med skript som kör bibliotekets funktioner och routernas `GET`/`POST` direkt (med
`node node_modules/.bin/jiti`, som `scripts/club-logos-vector.ts`) med `process.env` satt i skriptet, mot provhubben
`scripts/hub-mock.mjs`. Hela kretsen över HTTP körs till sist av huvudsessionen med `scripts/hub-e2e.mjs`.

## Att koppla in de riktiga systemen

Det som simuleras i POC:n sitter bakom gränssnitt, och flödets API:er går att nå utan demolösenordet (de kontrollerar
själva nyckel eller inloggning, se `lib/access.ts`).

| System | Kopplas in | Behövs från dem |
| --- | --- | --- |
| New Waves affärssystem och API-hubb, ut | Sätt `HUB_MODE=http`, `HUB_API_URL`, `HUB_API_KEY` (och `HUB_AUTH_HEADER` om nyckeln inte ska gå som `Authorization: Bearer`), och skriv översättningen till hubbens fältnamn och ändpunkter i `lib/poc/hub/mapping.ts`. Allt annat är byggt: `hub()` i `lib/poc/hub/client.ts` (tidsgräns 15 s, `Idempotency-Key`, nya försök vid nät, tidsgräns, 5xx, 408 och 429), utkorgen `hub_outbox` (`lib/poc/hub/outbox.ts`: posten läggs i orderns transaktion, försök direkt och efter 1, 5, 15, 30, 60 min och sedan varje timme i ett dygn, därefter "misslyckad" och larm; Craft skickar igen från ordervyn), avbokningar, butikens ordernummer (`externalRef` eller `Idempotency-Key` i `POST /api/v1/orders`), signerade fillänkar i ordern (`GET /api/v1/hub/filer/{token}`) och hubbens status in i ordern (`applyOrderStatus` i `lib/poc/orders.ts`). Utan adress eller nyckel i http-läget skickas inget: ordrarna väntar i utkorgen och ett larm går | API-beskrivning (ändpunkter, fältnamn, hur nyckeln skickas); att samma `Idempotency-Key` ger samma svar och aldrig två ordrar; om ordern bekräftas i svaret eller senare (202); anropet för att avboka och vad det svarar när ordern redan är i produktion; om de hämtar produktionsfilerna direkt eller behöver längre giltighet än två veckor; om `GET /stock` utan `since` ger hela lagret |
| Utkorgen mot hubben | Timern i `instrumentation.ts` kör varje minut i serverprocessen (`HUB_TIMER=0` stänger av den). Ett schema utanför kan dessutom köra `POST /api/v1/hub/kor` (nyckel `HUB_CRON_KEY` i `x-api-key` eller som Bearer; `?alla=1` skickar allt som väntar direkt) | – |
| Intersports klubbshoppar | Ordrar in: `POST /api/v1/orders` (nyckel `INTERSPORT_API_KEY`). Produkter ut: publiceringen i `lib/poc/build.ts`/`store.ts` skickas vidare till deras produkt-API | Deras produkt-API och hur ordrar och betalning kommer tillbaka |
| Tryckeriet och stickeriet | Hämtar jobb och filer: `/api/v1/producers/{tryckeri,stickeri}/jobs` (nycklar `PRODUCER_KEY_*`), eller köerna på `/producent` med lösenord – om de inte nås via New Waves hubb | Om de vill hämta själva eller få jobben skickade (webhook) |
| Crafts produktdata | `scripts/poc-import-catalog.ts` → `lib/poc/catalog-data.json` | Artikelnummer, namn, pris, storlekar, färger (från Robin) |
| Säsongsschemat | `POST /api/v1/craft/sasong/kor` en gång i timmen (nyckel `CRAFT_SEASON_KEY`) | – |

Miljövariabler i produktion: `DATABASE_URL`, `CRAFT_PASSWORD`, `STICKERI_PASSWORD`, `TRYCKERI_PASSWORD`,
`POC_SESSION_SECRET`, `PRODUCER_KEY_STICKERI`, `PRODUCER_KEY_TRYCKERI`, `INTERSPORT_API_KEY`, `CRAFT_SEASON_KEY`, och för
hubben `HUB_MODE`, `HUB_API_URL`, `HUB_API_KEY`, `HUB_CRON_KEY`, `PUBLIC_BASE_URL` och `ALERT_WEBHOOK_URL` (valfria:
`HUB_AUTH_HEADER`, `HUB_PULL`, `HUB_FILE_TTL_H`, `HUB_TIMER`). `POC_SESSION_SECRET` signerar också fillänkarna till hubben:
byts den slutar länkarna i redan skickade ordrar att gälla.

## Regler för bygget

- Next.js 16 skiljer sig från tidigare versioner: läs guiden i `node_modules/next/dist/docs/` innan kod skrivs.
- Gränssnitt, kommentarer och texter på svenska. Följ hur befintliga sidor ser ut och är byggda.
- Ingen commit och ingen push – Christopher bestämmer när något går ut (push till `main` driftsätter).
- En gemensam utvecklingsserver kör på `http://localhost:3300`. Starta ingen egen och kör inte `next build`.
  Kontrollera typerna med `npx tsc --noEmit` och lint med `npx eslint <filer>`.
- Inga modellanrop i flödet (det ska gå att visa gratis och utan väntan).
