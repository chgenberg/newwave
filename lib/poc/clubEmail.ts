/**
 * Föreningens egna adresser – info@, kansli@, styrelsen@ och liknande på klubbens egen domän – ur adresserna som
 * skrapningen hittade på klubbens webbplats. Personliga adresser (fornamn.efternamn@…), adresser hos plattformar
 * (laget.se, SvenskaLag) och sponsorers adresser tas aldrig med. Mejlutkasten till klubbarna går till de här
 * (lib/poc/content.ts), och bara de läggs i produktionens databas (POST /api/v1/craft/klubbmejl).
 */

/** Adressens del före @, utan siffror och tecken. Ordningen är vilken adress som står först i mejlet. */
const ROLES = [
  "info", "kansli", "kansliet", "kontakt", "contact", "styrelsen", "styrelse", "ordforande", "ordf", "sekreterare", "kassor", "ekonomi",
  "klubbchef", "sportchef", "post", "mail", "hej", "klubben", "klubb", "foreningen", "forening", "kontoret", "reception", "receptionen",
  "medlem", "marknad", "sponsring", "ungdom", "ungdomsansvarig", "fotboll", "handboll", "innebandy", "ishockey", "bandy", "friidrott",
  "gymnastik", "simskola", "ridskolan", "ridskola", "bordtennis", "tennis", "golf", "kiosk", "shop", "butik", "bokning", "anmalan",
  "tavling", "utbildning",
];
const RANK = new Map(ROLES.map((r, i) => [r, i]));

/** Ord i klubbnamnet som inte säger vilken klubb det är. */
const GENERIC = new Set([
  "idrottsklubb", "idrottsforening", "sportklubb", "fotbollsklubb", "forening", "foreningen", "klubb", "klubben", "golfklubb", "ridklubb",
  "tennisklubb", "skytteforening", "sallskap", "fotboll", "bandy", "hockey", "innebandy", "handboll", "friidrott", "gymnastik", "simklubb",
  "sport", "club", "ryttarforening", "alliansforening",
]);

/** Plattformar och förbund som många klubbar har sin webbplats hos: deras adresser är inte klubbens. */
const PLATFORMS = new Set(["laget.se", "svenskalag.se", "idrottonline.se", "sportadmin.se", "rf.se", "svenskidrott.se", "wordpress.com", "wix.com", "wixsite.com", "one.com", "mysite.com", "google.com", "gmail.com", "hotmail.com", "outlook.com", "live.se", "yahoo.se", "icloud.com"]);

const ADDRESS = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/;
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
/** Domänen utan underdomäner: "www.vaksalask.se" → "vaksalask.se". */
const registrable = (host: string) => host.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");

/**
 * Högst tre föreningsadresser, info@ och kansli@ först. En adress räknas när delen före @ är en roll och domänen är
 * klubbens webbplats eller bär klubbens namn (kansli@vaksalask.se för Vaksala SK på laget.se).
 */
export function roleAddresses(club: { name: string; host?: string }, emails: readonly unknown[]): string[] {
  const site = club.host ? registrable(club.host) : "";
  const host = PLATFORMS.has(site) ? "" : site;
  const tokens = fold(club.name)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GENERIC.has(t));
  const found = new Set<string>();
  for (const raw of emails) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!ADDRESS.test(email)) continue;
    const [local, domain] = email.split("@");
    if (!RANK.has(local.replace(/[^a-z]/g, ""))) continue;
    const label = domain.split(".")[0];
    if (PLATFORMS.has(registrable(domain))) continue;
    if ((host && registrable(domain) === host) || tokens.some((t) => label.includes(t))) found.add(email);
  }
  return [...found].sort((a, b) => RANK.get(a.split("@")[0].replace(/[^a-z]/g, ""))! - RANK.get(b.split("@")[0].replace(/[^a-z]/g, ""))!).slice(0, 3);
}
