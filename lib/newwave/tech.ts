/** Den tekniska översikten för New Waves IT: samma innehåll på sidan och i PDF:en. `prod` märker det som kommer i produktionen, allt annat finns i demot. */

export type Point = { title: string; text: string; prod?: true };

export const TECH_TITLE = "Så är hubben byggd";
export const TECH_LEAD = "Vi bygger mot ert system, levererar filer som tryckeriet kan köra direkt och kör produktionen i AWS i Stockholm.";

export const PROMISES = [
  { id: "integration", title: "Integrationer", text: "Ett versionerat API in i ert system. Vi anpassar oss efter ert API – inte tvärtom." },
  { id: "tryckfiler", title: "Tryckfiler", text: "Rätt format per metod, i exakt tryckstorlek, med Pantone och kontrollsumma." },
  { id: "sakerhet", title: "Säker drift", text: "Produktionen körs i AWS i Stockholm – krypterad, loggad och med inloggning med MFA." },
] as const;

export const FLOW: Point[] = [
  { title: "Klubben godkänner", text: "Inget går vidare utan ett godkännande i klubbens dashboard." },
  { title: "Hubben gör filerna", text: "Ett jobb per tryckposition, med filer, specifikation och SHA-256 per fil." },
  { title: "POST /v1/print-jobs", text: "Händelsen material.approved med alla fil-URL:er. Demon bygger anropet – i produktion skickas det till ert system.", prod: true },
  { title: "Ert system svarar 201", text: "Ni hämtar filerna och fördelar jobben till tryck, lager, frakt och ekonomi.", prod: true },
];

export const API_POINTS: Point[] = [
  { title: "Versionerat", text: "Allt ligger under /v1, så ert system går inte sönder när vi bygger vidare." },
  { title: "Aldrig dubbelt", text: "Varje leverans och jobb har ett fast id, så att ert system aldrig behöver registrera samma jobb två gånger." },
  { title: "Tål avbrott", text: "Ligger ert system nere köas leveransen och skickas igen automatiskt.", prod: true },
];

export const PRINT_CHECKS: Point[] = [
  { title: "Exakt storlek", text: "Motivet skalas till tryckytan i mm – ingen skalning i RIP:en." },
  { title: "Rätt färger", text: "Färgerna matchas mot klubbens profil och närmaste Pantone." },
  { title: "Spårbart", text: "Varje fil har en SHA-256, och samma innehåll ger alltid samma fil." },
];

export const LAYERS = [
  { title: "Ytorna", items: ["Klubbens dashboard", "Crafts dashboard", "Merch-butiken", "Återförsäljarens shop"] },
  { title: "Hubben – en motor", items: ["Brand & Creative", "Content & kampanj", "Produkt & pris", "Offert & sälj", "Kvalitet & godkännande", "Kundytor", "Kundinsikt"] },
  { title: "Data, filer och AI", items: ["Databas", "Fillagring", "AI-modeller"] },
  { title: "HUB-API → New Wave", items: ["Tryckfiler", "Ordrar", "Produktdata och SKU", "Kunddata"] },
] as const;

export const PRINCIPLES: Point[] = [
  { title: "En motor, fyra ytor", text: "Klubb, Craft, merch och återförsäljare använder samma kod och samma regler." },
  { title: "TypeScript hela vägen", text: "Strikt typat från ytorna till API-anropet – fel fångas innan koden körs." },
  { title: "Validerat vid varje kant", text: "Allt som kommer in i API:t kontrolleras mot ett schema (zod) innan det används." },
  { title: "Isolerat", text: "Varje besökare får en egen kopia av demon. I produktion ser varje klubb, Craft och återförsäljare bara sin egen data." },
  { title: "Spårbart", text: "Varje godkännande och leverans sparas med innehåll och tid. I produktion även vem, i en revisionslogg." },
];

export const MODULES = [
  { path: "app/api/v1", text: "API:t – samma rutter som ert system pratar med" },
  { path: "lib/newwave/hubDelivery.ts", text: "Leveransen: jobb, kontrollsummor och API-anropet" },
  { path: "lib/newwave/printFiles.ts", text: "Tryckfilerna per metod: PNG, SVG, filmer och korrektur" },
  { path: "lib/newwave/embroidery.ts", text: "Brodyren: stygn och Tajima DST" },
  { path: "lib/newwave/marking.ts", text: "Märkningen: metoder, positioner och storlekar" },
  { path: "lib/newwave/catalog.ts", text: "Sortimentet med tryckytor per produkt" },
  { path: "components/newwave", text: "Ytorna: dashboards, butiker och designstudion" },
] as const;

export type RunRow = { area: string; demo: string; prod: string };

export const AWS_REGION = "eu-north-1 · Stockholm";

/** Demon i dag mot produktionen i AWS – öppet, så att inget lovas som inte finns. */
export const RUN: RunRow[] = [
  { area: "Drift", demo: "En container på Railway", prod: "Containrar i Amazon ECS (Fargate) över flera zoner" },
  { area: "Databas", demo: "JSON-filer på en volym", prod: "Amazon RDS PostgreSQL, krypterad, med återställning till valfri tidpunkt" },
  { area: "Filer", demo: "Disk på servern", prod: "Amazon S3, krypterad med KMS, versionerad, tidsbegränsade länkar" },
  { area: "AI", demo: "OpenAI:s API", prod: "Amazon Bedrock i EU – er data används inte för träning" },
  { area: "Inloggning", demo: "Ett gemensamt demolösenord", prod: "Inloggning med MFA och roller per klubb, Craft och New Wave" },
  { area: "Hemligheter", demo: "Miljövariabler", prod: "AWS Secrets Manager" },
  { area: "Skydd", demo: "HTTPS", prod: "CloudFront och AWS WAF framför allt, HTTPS hela vägen" },
  { area: "Loggning", demo: "Serverloggar", prod: "CloudWatch och CloudTrail, plus revisionslogg i hubben" },
  { area: "Backup", demo: "–", prod: "Dagliga backuper som vi provar att återställa" },
  { area: "API", demo: "Anropet byggs exakt som det skickas och visas hos New Wave", prod: "Signerade webhooks (HMAC), nya försök vid avbrott, OpenAPI-specifikation" },
];

export const FAQ = [
  { q: "Vem äger datan?", a: "Ni och klubbarna. I produktion ligger allt i AWS i Stockholm, och det kan exporteras när som helst – data som JSON och filerna som de är." },
  { q: "Vad händer om ert system ligger nere?", a: "I produktion köas leveransen och skickas igen automatiskt. Varje leverans har ett fast id, så inget tappas och inget behöver registreras två gånger." },
  { q: "Kan vi hämta filerna själva i stället?", a: "Ja. Samma leverans finns som API-anrop (JSON) och som zip, och i produktion kan filerna också läggas direkt i er egen S3-bucket." },
  { q: "Hur kopplar ni mot vårt affärssystem?", a: "Mot ert API, via SFTP eller som CSV – vi bygger kopplingen på vår sida, så ert system behöver inte ändras." },
  { q: "Används vår data för att träna AI?", a: "Nej. I produktion körs AI-modellerna i Amazon Bedrock inom EU, och datan används inte för träning." },
  { q: "Vad behöver ni från oss?", a: "Er API-dokumentation, en testmiljö och tryckeriets filkrav. Sedan kopplar vi upp mot testmiljön först." },
] as const;
