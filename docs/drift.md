# Drift: Next Wave Commerce Hub i produktion

För den som sköter driften: Christopher och New Waves IT. Hur flödet hänger ihop står i `docs/poc-flode.md`, och
hubbens API i `docs/hubb-api.yaml` (också på `/api/v1/hub/openapi`). Här står det som behövs för att köra det:
miljövariablerna, scheman, säkerhetskopior, testmiljö, larm, loggar, vad som händer när hubben inte svarar, hur
personuppgifterna tas bort och en checklista för skarp start.

## Var allt körs

| Del | Var |
| --- | --- |
| Sajten och API:erna | Railway, projektet "Newwave", miljön `production`. En tjänst byggd från `Dockerfile` (Next.js 16, Node 20). Adress: `https://www.nextwaveproduction.se` |
| Databasen | Postgres-tjänsten i samma Railway-projekt. Appen når den med `DATABASE_URL`. Tabellerna skapas av koden själv vid första anropet, så inget migreringssteg behövs |
| Filerna | Volymen på `/app/.data`: designer, mockuper, miljöbilder, varumärkespaket, klubbmärken i hög upplösning och annat som sajten gjort. Klubbregistret följer med bygget (`registry/clubs`) |
| Koden | GitHub-repot `chgenberg/newwave`. Push till `main` bygger och driftsätter (fem till åtta minuter) |

Efter en push skriver Railway en status på commiten:
`gh api repos/chgenberg/newwave/commits/<sha>/status --jq '.statuses[0] | "\(.state) – \(.description)"'` ger först
`pending` och sedan `success`.

## Miljövariabler

Sätts på appens tjänst i Railway (Variables). En ändrad variabel gäller efter omstart, som Railway gör själv när
variablerna sparas. Hemligheter görs långa och slumpade, till exempel med `openssl rand -base64 32`, och skrivs aldrig
i koden, i ärenden eller i chattar. Variabler i fetstil måste vara satta i produktion: utan dem är den delen avstängd
(koden har inga demovärden i produktion).

### Grunden

| Variabel | Vad |
| --- | --- |
| **`DATABASE_URL`** | Postgres. Sätts som referens till databastjänsten: `${{Postgres.DATABASE_URL}}` |
| `NODE_ENV` | `production` – sätts redan av `Dockerfile` |
| `PORT` | Sätts av Railway |
| `DEMO_PASSWORD` | Lösenord framför hela sajten. Utan den är sajten öppen. Flödets API:er (ordrar, producenter, katalog, hubben, scheman) är undantagna och kontrollerar själva nyckel eller inloggning, se `OPEN` i `lib/access.ts` |
| `ADMIN_PASSWORD` | Eget lösenord till besöksstatistiken (`/newwave/besok`) |

### Inloggning och nycklar i flödet

| Variabel | Vad |
| --- | --- |
| **`CRAFT_PASSWORD`**, **`STICKERI_PASSWORD`**, **`TRYCKERI_PASSWORD`** | Lösenorden för Crafts, stickeriets och tryckeriets inloggning (`/logga-in`) |
| **`POC_SESSION_SECRET`** | Signerar inloggningens cookie och fillänkarna till hubben. Byts den loggas alla ut och redan skickade fillänkar slutar gälla |
| **`PRODUCER_KEY_STICKERI`**, **`PRODUCER_KEY_TRYCKERI`** | Producenternas API-nycklar (`x-api-key`) till `/api/v1/producers/{stickeri,tryckeri}/…` |
| **`INTERSPORT_API_KEY`** | Butikens nyckel till `POST /api/v1/orders` och `POST /api/v1/orders/lookup` |
| **`CRAFT_SEASON_KEY`** | Schemats nyckel för säsongsplanerna (`POST /api/v1/craft/sasong/kor`) |
| **`POC_RENSA_KEY`** | Schemats nyckel för rensningen av personuppgifter (`POST /api/v1/poc/rensa`) |
| `POC_KUNDUPPGIFTER_MANADER` | Hur många månader kundens uppgifter sparas efter att ordern skickats eller avbrutits. Standard `12` |

### Kopplingen mot New Waves hubb

| Variabel | Vad |
| --- | --- |
| **`HUB_MODE`** | `http` mot den riktiga hubben. `simulerad` (standard) svarar själv och ska bara användas i test. Ett okänt värde räknas som `http` och fallerar stängt |
| **`HUB_API_URL`**, **`HUB_API_KEY`** | Hubbens adress (https, utan avslutande snedstreck) och nyckel |
| `HUB_AUTH_HEADER` | Rubriken som bär nyckeln. Standard `Authorization` med `Bearer <nyckel>`; ett annat namn skickar nyckeln som den är |
| **`HUB_WEBHOOK_SECRET`** | Hemligheten för signaturen (HMAC-SHA256) på hubbens händelser till `POST /api/v1/hub/webhook` |
| **`HUB_CRON_KEY`** | Schemats nyckel för utkorgen och hämtningen (`POST /api/v1/hub/kor`) |
| `HUB_PULL` | `1`: vi hämtar lager och produkter från hubben själva, om hubben inte skickar händelser |
| `HUB_FILE_TTL_H` | Hur många timmar fillänkarna till hubben gäller. Standard `336` (två veckor), högst 90 dygn |
| `PUBLIC_BASE_URL` | Sajtens adress i länkarna till hubben. Standard `https://www.nextwaveproduction.se`; i testmiljön testmiljöns adress |
| **`ALERT_WEBHOOK_URL`** | Larmen, t.ex. en Slack-webhook. Utan den skrivs larmen bara i loggen |

Med `HUB_MODE=http` och en saknad eller ogiltig adress eller nyckel skickas ingenting: ordrarna väntar i utkorgen och
ett larm går. Det faller aldrig tillbaka på simuleringen. Vad som saknas syns på Crafts integrationssida, utan
nycklarnas värden.

### Modeller och gränser

| Variabel | Vad |
| --- | --- |
| `OPENAI_API_KEY` | Behövs för miljöbilderna och "Skriv om med AI". Inget annat i flödet anropar en modell |
| `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY` | Modellerna och bildkvaliteten (standard `medium`). Kostnaden för varje anrop räknas ur svarets tokens och syns under Utskick |
| `POC_MILJOBILD_PER_HOUR`, `POC_SKRIV_OM_PER_HOUR` | Högst så många miljöbilder och omskrivningar i timmen, för alla tillsammans. Standard 30 |
| `ERP_SIMULATE_FAIL` | Bara för test: får det simulerade affärssystemet att fallera. Får inte vara satt i produktion |

### Resten av demosajten

`RESEND_API_KEY`, `NW_MAIL_FROM`, `NW_MAIL_BCC`, `DEMO_MAIL_FROM`, `DEMO_MAIL_BCC` (mejl med offerter),
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (sms), `IPINFO_TOKEN` (ort i besöksloggen), `LOGO_MODEL`,
`SCARF_PHOTO_MODEL`, `SCARF_PHOTO_QUALITY`, `SCARF_PHOTO_REVIEW`, `DERBY_IMAGES`, och gränserna per timme (`*_PER_IP_HOUR`,
`*_GLOBAL_HOUR`, `*_MAX_STORED`). Standardvärdena fungerar; ingen av dem behövs för orderflödet. `CHROMIUM_PATH` sätts
av `Dockerfile`.

## Scheman

| Vad | Anrop | Hur ofta | Nyckel |
| --- | --- | --- | --- |
| Utkorgen till hubben (nya ordrar och avbokningar), larmet om obekräftade ordrar och, med `HUB_PULL=1`, hämtningen av lager och produkter | `POST /api/v1/hub/kor` | Varje minut: processens egen timer (`instrumentation.ts`) gör det. Schemat på Railway är reserven, var femte minut | `HUB_CRON_KEY` |
| Säsongsplanerna som ska publiceras | `POST /api/v1/craft/sasong/kor` | Varje timme | `CRAFT_SEASON_KEY` |
| Rensningen av personuppgifter | `POST /api/v1/poc/rensa` | En gång om dygnet, på natten | `POC_RENSA_KEY` |

Alla tre tål att köras oftare eller två gånger samtidigt: utkorgen låser varje post, en plan publiceras bara en gång
och en rensad order rensas inte igen.

**På Railway:** ett schema är en egen tjänst med ett cron-schema (Settings → Cron Schedule) och ett startkommando som
gör sitt och avslutas. Railway kör schemat i UTC, högst var femte minut, och hoppar över en körning om den förra inte är
klar – därför sköter processens timer varje minut och schemat är reserv.

1. Ny tjänst i projektet: Docker-avbildningen `curlimages/curl`.
2. Variabler på tjänsten, som referenser till appens: `HUB_CRON_KEY=${{<appens tjänst>.HUB_CRON_KEY}}` (och
   `CRAFT_SEASON_KEY`, `POC_RENSA_KEY` på respektive tjänst).
3. Startkommando och schema, till exempel:

```sh
# Utkorgen och hämtningen, var femte minut: */5 * * * *
curl -fsS -A "NextWave-schema/1.0" -X POST -H "x-api-key: $HUB_CRON_KEY" https://www.nextwaveproduction.se/api/v1/hub/kor

# Säsongsplanerna, varje hel timme: 0 * * * *
curl -fsS -A "NextWave-schema/1.0" -X POST -H "x-api-key: $CRAFT_SEASON_KEY" https://www.nextwaveproduction.se/api/v1/craft/sasong/kor

# Rensningen av personuppgifter, 02.30 UTC varje natt: 30 2 * * *
curl -fsS -A "NextWave-schema/1.0" -X POST -H "x-api-key: $POC_RENSA_KEY" https://www.nextwaveproduction.se/api/v1/poc/rensa
```

`-A` behövs: sajten stoppar anrop med curls egen user-agent i produktion (botfiltret i `lib/bots.ts`). `-f` gör att
körningen syns som misslyckad i Railway om svaret inte är 2xx. Varje schema provas en gång för hand efter att det satts
upp, och svaret och loggen kontrolleras (se Loggar).

Med `DEMO_PASSWORD` påslaget måste schemats adress finnas bland de öppna adresserna (`OPEN` i `lib/access.ts`) för att
nå fram; där ska `/api/v1/craft/sasong/kor`, `/api/v1/hub/kor` och `/api/v1/poc/rensa` finnas.

## Personuppgifter

Kundens namn, e-post, telefon och adress finns i ordern så länge den behövs för leveransen och frågor om den. Sedan tas
de bort (`lib/poc/privacy.ts`):

- **Med tiden:** när ordern är skickad eller avbruten och inte ändrats på `POC_KUNDUPPGIFTER_MANADER` månader
  (standard 12). En order som aldrig blev klar rensas efter dubbelt så lång tid utan ändringar. Schemat kör det varje
  natt, högst 500 ordrar åt gången.
- **På begäran:** driften skickar kundens e-post till samma adress (Craft kan också, inloggad). Alla kundens avslutade ordrar rensas direkt. En
  pågående order rensas inte, eftersom adressen behövs för leveransen; den kommer tillbaka i svaret (`kept`), och
  begäran görs om när ordern är skickad eller avbruten.

```sh
# Räkna först (torrkörning), sedan på riktigt.
curl -fsS -A "NextWave-drift/1.0" -X POST -H "x-api-key: $POC_RENSA_KEY" -H "content-type: application/json" \
  -d '{"email":"kunden@exempel.se","torr":true}' https://www.nextwaveproduction.se/api/v1/poc/rensa
curl -fsS -A "NextWave-drift/1.0" -X POST -H "x-api-key: $POC_RENSA_KEY" -H "content-type: application/json" \
  -d '{"email":"kunden@exempel.se"}' https://www.nextwaveproduction.se/api/v1/poc/rensa
```

Svaret är `{ dryRun, months, orders, numbers, more, kept? }`: hur många ordrar som rensades (eller skulle rensas) och
deras nummer. `?torr=1` eller `{"torr":true}` räknar bara.

Det som tas bort ur ordern: namnet (ersätts med "Kunduppgifterna är borttagna"), e-post, telefon och adress. Samma
uppgifter byts mot "[borttaget]" i tidslinjens texter, i orsaken till att ordern avbröts och i producenternas
anteckningar, och spårningsnumren tas bort (de leder till adressen hos fraktbolaget). Producenternas kö läser kunden ur
ordern och visar alltså inte heller något. Ordern, raderna, beloppen, klubben och datumen finns kvar för statistiken.
Tidslinjen får en rad om när och varför uppgifterna togs bort.

**Klubbarnas adresser.** Mejlutkasten till klubbarna går till föreningens egna adresser – info@, kansli@, styrelsen@
och liknande på klubbens domän (`lib/poc/clubEmail.ts`) – aldrig till personliga adresser. Registrets paket är publikt
och har inga kontaktuppgifter, så adresserna ligger i databasen (`poc_club_emails`). De läggs in från datorn med
skrapningens filer: `POST /api/v1/craft/klubbmejl` med Crafts inloggning och `{ "clubs": { "<klubb-id>": [adresser] } }`
(högst 2 000 klubbar per anrop). Servern väljer om adresserna själv, och en klubb utan föreningsadress tas bort.
`GET` ger hur många klubbar som har adresser. Inlagt 27 november 2026: 1 422 klubbar.

Det som inte når hit och måste hanteras där: kopian i New Waves hubb och affärssystem (där Crafts bokföring sker), och
Intersports egen kopia av ordern. En begäran från en kund ska därför också gå vidare till dem. Säkerhetskopiorna
innehåller uppgifterna tills de gått ut (se nedan); spara därför inte egna dumpar längre än tre månader. Loggarna
innehåller ordernummer, klubb och belopp, men inte kundens namn, e-post eller adress.

## Säkerhetskopior

**Postgres.** På databastjänsten i Railway, fliken Backups: schemalägg dagliga och veckovisa kopior (Railway sparar
dagliga i 6 dygn, veckovisa i 27 och månadsvisa i 89). Ta också en manuell kopia före varje större ändring, till exempel
skarp start. Railways kopior försvinner om volymen tas bort, så ta en egen dump en gång i veckan och spara den utanför
Railway, krypterad:

```sh
# Databastjänstens publika adress finns i dess variabel DATABASE_PUBLIC_URL (Railway → Postgres → Variables).
# pg_dump måste vara minst samma version som servern.
pg_dump "$DATABASE_PUBLIC_URL" --format=custom --no-owner --file="nextwave-$(date +%F).dump"
```

Återställning görs i testmiljön först: `pg_restore --clean --if-exists --no-owner --dbname "$TESTMILJONS_DATABAS" fil.dump`.
Prova en återställning en gång i kvartalet, så att det är känt att kopiorna fungerar.

**Volymen `/app/.data`.** På appens tjänst, fliken Backups: samma schema (dagligt och veckovis). Det viktiga där är
filerna som sajten gjort och som inte går att göra om gratis (designer, mockuper, miljöbilder, varumärkespaket,
klubbmärken i hög upplösning). Ordrarna och jobben ligger i databasen, och produktionsfilerna byggs om ur den vid varje
nedladdning.

En återställning i Railway tar bort de kopior som är nyare än den som återställs: ta en manuell kopia av läget före,
om det inte är det som gått sönder.

## Testmiljö

En egen miljö i samma Railway-projekt (Environments → New Environment, kopia av `production`), med egen databas och
egen volym, kopplad till en egen gren (till exempel `test`) så att `main` inte påverkas. Skillnaderna mot produktionen:

- `HUB_MODE=simulerad`, eller `http` mot New Waves testhubb med testhubbens `HUB_API_URL` och `HUB_API_KEY`.
- `PUBLIC_BASE_URL` = testmiljöns adress, så att fillänkarna till testhubben pekar på testmiljön.
- Egna lösenord, nycklar och `POC_SESSION_SECRET` – aldrig produktionens.
- `DEMO_PASSWORD` påslaget.
- `ALERT_WEBHOOK_URL` till en egen testkanal, eller inte alls.

Lokalt: `npm run dev` med `.env.local` och databasen `nextwave_poc`. Provhubben (`scripts/hub-mock.mjs`) och provet av
hela kretsen (`scripts/hub-e2e.mjs`) körs mot den lokala servern.

## Larm

Allt som behöver en människa larmar: en order eller avbokning som inte kommer fram till hubben, hubben som inte svarat
på en knapp timme, hubben som saknar inställningar eller nekar nyckeln, lager och produkter som inte går att hämta.
Larmet skrivs alltid i loggen som `poc/larm [nyckel] text`, och med `ALERT_WEBHOOK_URL` skickas `{ "text": "…" }` dit,
högst en gång i timmen per larm (ett fel som upprepas varje minut dränker inte kanalen).

Slack: skapa en app med Incoming Webhooks i den kanal som ska få larmen, och sätt adressen i `ALERT_WEBHOOK_URL`. Andra
tjänster som tar emot `{ "text": … }` som JSON fungerar också.

Utöver det: slå på Railways aviseringar för misslyckade byggen och tjänster som kraschar (projektets inställningar), och
låt gärna en extern övervakning hämta `https://www.nextwaveproduction.se/robots.txt` varje minut – den är öppen och
svarar bara om sajten är uppe.

## Loggar

Railway-CLI:t, i repots mapp (inloggat och länkat till projektet):

```sh
railway logs --lines 400 --since 40m            # programmets logg
railway logs --http --lines 200 --since 40m     # anropen, med status och svarstid
railway logs --lines 2000 --since 24h | grep "poc/larm"
```

Raderna börjar med delen de kommer från: `poc/orders` (nya ordrar: nummer, klubb, affärssystemets nummer, summa),
`poc/larm` (larmen), `poc/hubb` (utkorgen och hämtningen), `poc/privacy` och `poc/rensa` (rensningen), `poc/content`
(modellanropen och deras kostnad), `poc/auth` (saknade lösenord och nycklar vid start). Loggarna sparas olika länge
beroende på Railway-planen; ladda ner det som behöver sparas längre.

## När hubben inte svarar

- **Butikens order tas emot ändå.** Den sparas, kunden får ordernummer och statussida, och en post läggs i utkorgen i
  samma transaktion. Ordern står som "mottagen" tills hubben bekräftat den.
- **Utkorgen försöker igen:** direkt, sedan efter 1, 5, 15, 30 och 60 minuter och därefter varje timme i ett dygn. Efter
  en knapp timme går larmet att hubben inte svarar. Efter sista försöket blir posten "misslyckad", ett larm går och Craft
  kan skicka igen från ordervyn. Avbokningar går samma väg.
- **Aldrig två ordrar:** varje försök bär samma `Idempotency-Key` (vårt ordernummer), och hubben ska svara som förra
  gången i stället för att lägga ordern igen. Därför börjar ordernumren aldrig om, inte heller efter att demodatan tagits
  bort.
- **Producenterna** får jobben först när hubben bekräftat ordern. Inget tillverkas utan bekräftelse.
- **Fel som inte blir bättre av nya försök** (hubben nekar posten med 4xx utom 408 och 429): posten blir "misslyckad"
  direkt och larmar. Svarar hubben 429 med `Retry-After` väntar utkorgen så länge.
- **Saknas hubbens inställningar** (adress eller nyckel), eller nekas nyckeln: allt väntar i utkorgen utan att försöken
  räknas, och ett larm går. När inställningen är rättad går posterna iväg av sig själva.
- **Lager:** utan lagersaldo från hubben säljs artikeln som i dag.
- **Om vår sajt ligger nere** når hubbens händelser och butikens ordrar inte fram; de behöver försöka igen från sin
  sida. Samma händelse två gånger behandlas bara en gång.

Det som har fastnat syns i Crafts ordervy (orderns status och hubbens svar) och på integrationssidan.

## Skarp start: checklista

1. **Säkerhetskopior:** manuell kopia av Postgres och volymen i Railway, och en egen `pg_dump`. Schemalägg dagliga och
   veckovisa kopior.
2. **Miljövariablerna:** allt i fetstil ovan satt med nya, slumpade värden. `HUB_MODE=http` med den riktiga hubbens
   `HUB_API_URL`, `HUB_API_KEY` och `HUB_WEBHOOK_SECRET`. `PUBLIC_BASE_URL` rätt. `ERP_SIMULATE_FAIL` inte satt. Loggen
   vid start (`poc/auth`) säger inte att något saknas, och Crafts integrationssida visar hubben som klar.
3. **Botfiltret:** hubbens, Intersports och producenternas system når sina adresser i produktion (`lib/bots.ts` stoppar
   t.ex. `Java/`, `okhttp`, `axios`, `python-requests` och anrop utan user-agent). Prova med deras riktiga klienter.
4. **Öppna adresser:** med `DEMO_PASSWORD` påslaget finns `/api/v1/hub/kor`, `/api/v1/hub/webhook`, `/api/v1/hub/filer/`
   och `/api/v1/poc/rensa` i `OPEN` i `lib/access.ts`.
5. **Demodatan bort:** i tjänstens skal på Railway (`railway ssh`, där `DATABASE_URL` redan är satt), först som
   torrkörning:

   ```sh
   node node_modules/.bin/jiti scripts/poc-rensa-demodata.ts --produktion=<värdnamnet skriptet skriver ut>
   node node_modules/.bin/jiti scripts/poc-rensa-demodata.ts --ta-bort --produktion=<värdnamnet>
   ```

   Skriptet listar provordrarna, innehållspaketen, säsongsplanerna och vad som får stå kvar. Designerna och
   klubbprodukterna (det som ligger i shopparna) står kvar; `--med-designer` tar bort även dem om shopparna ska börja om
   tomma. Hubbens tabeller som hör till ordrarna följer med; andra står under "Rörs inte" och tas bara med `--även=`.
6. **Hela kedjan i testmiljön** mot New Waves testhubb: en order från butiken, bekräftelse, jobb hos stickeriet och
   tryckeriet, filerna nedladdade, status tillbaka till kunden, en avbokning. Sedan en riktig order i produktionen.
7. **Scheman** uppsatta och provade en gång var för hand: `/api/v1/hub/kor`, `/api/v1/craft/sasong/kor`,
   `/api/v1/poc/rensa` (först med `?torr=1`).
8. **Larmen:** `ALERT_WEBHOOK_URL` satt, och ett larm har kommit fram (till exempel i testmiljön med en felaktig
   `HUB_API_KEY`). Railways aviseringar påslagna.
9. **Personuppgifterna:** tiden i `POC_KUNDUPPGIFTER_MANADER` bestämd, vem som tar emot kundernas begäran och hur den
   går vidare till New Wave och Intersport.
10. **Inloggningarna** lämnade till Craft, stickeriet och tryckeriet på ett säkert sätt, och producenternas
    API-nycklar till den som kopplar deras system.
