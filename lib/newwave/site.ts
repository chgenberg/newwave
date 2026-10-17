/** Sajtens publika adress. Docker-bygget får inga Railway-variabler, och /newwave är statisk – därför produktionsadressen som reserv. */
export const SITE = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : process.env.NODE_ENV === "production" ? "https://newwave-production.up.railway.app" : "http://localhost:3210";
