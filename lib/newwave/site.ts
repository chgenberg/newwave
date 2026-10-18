/** Sajtens publika adress. Docker-bygget får inga Railway-variabler, och /newwave är statisk – därför en fast adress i produktion. */
export const SITE = process.env.NODE_ENV === "production" ? "https://www.nextwaveproduction.se" : "http://localhost:3210";

/** Äldre och alternativa adresser; sidvisningar där skickas vidare till SITE så att alla länkar som byggs i webbläsaren pekar på domänen. */
export const ALIAS_HOSTS = ["newwave-production.up.railway.app", "nextwaveproduction.se"];
