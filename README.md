# Craft Klubbmerch (mockup)

Välj klubb → bekräfta signaler (högtider, säsong, trender) → välj motiv → ladda ner allt som zip.

## Kom igång

```bash
cp .env.local.example .env.local   # lägg in OPENAI_API_KEY
npm install
npm run dev
```

Öppna http://localhost:3000. Utan API-nyckel körs appen i demoläge med exempelinnehåll.

## Delar

- `lib/calendar.ts` – svenska högtider och säsonger som upptäcks automatiskt (60 dagar framåt).
- `lib/trends.ts` – nyheter om klubben (Google News RSS, 14 dagar) som AI filtrerar till positiva signaler utan spelarnamn.
- `lib/club.ts` + `lib/rules.ts` – klubbens låsta ramar och regelmotorn som stoppar motiv innan de ritas.
- `lib/agents.ts` – instruktioner för motivförslag, bildprompt och innehåll per kanal.
- `lib/compose.ts` – tryckfiler och kampanjbilder (Instagram, story, LinkedIn, hemsidebanner, TV).
- `lib/artwork.ts` + `lib/imagecheck.ts` – bildkontroll pixel för pixel och av AI-granskare, automatisk omritning (max 3 försök).
- `lib/vectorize.ts` – vektorisering till SVG i enbart klubbens färger; tryckfiler i 300 dpi (30×40 cm).
- `lib/photos.ts` – fotorealistiska produktbilder med tryckfilen som referens.
- `lib/video.ts` – 10-sekundersfilm (1080×1920, MP4) som renderas i webbläsaren.
- `lib/links.ts` – spårbara länkar och QR-koder per kanal.
- `lib/personalize.ts` – namn och nummer på ryggen, familjepaket till Fars och Mors dag.
- `app/match` + `app/api/v1/webhooks/match-result` – drop vid slutsignal med sms för godkännande (Twilio valfritt).
- `lib/zip.ts` – zip-paketet med foton, film, bilder, texter, affisch, publiceringsplan och guiden "SÅ HÄR GÖR DU".

## Railway

Miljövariabler: `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`,
`DEMO_PASSWORD` (lösenordsskydd, valfritt användarnamn) och `INTERSPORT_API_KEY` (nyckel för det simulerade Intersport-API:t).
Genererade filer sparas i `.data/` – montera en volym på `/app/.data` för att behålla dem mellan driftsättningar.
Sköldfilerna ligger i `brand-kits/` som reserv.

## Klubbens grafiska profil (lokal demo)

```bash
node scripts/scrape-ifk.mjs --images=200   # text, mediaregister, logotyper, tema och nyhetsbilder från ifkgoteborg.se
node scripts/build-brand-kit.mjs           # sköld i fullfärg/svart/vit som SVG + PNG (kräver poppler)
```

Allt sparas i `.data/brand/ifk-goteborg/` (ignoreras av git) och serveras via `/api/v1/brand/{clubId}/{fil}`.

API-dokumentation finns på `/api-docs`. Genererade filer sparas i `.data/files/`.

Klubbskölden är en platshållare; den officiella skölden hämtas från licensbiblioteket i produktion.
