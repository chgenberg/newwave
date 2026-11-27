/**
 * Sökmotorer, AI-crawlers och skrapverktyg stoppas i produktion. Förhandsvisningen av en delad länk i chattar
 * (facebookexternalhit, WhatsApp, Slackbot-LinkExpanding, Twitterbot m.fl.) får fortsätta hämta delningsbilden.
 */
const BLOCKED = new RegExp(
  [
    // AI och sökmotorer
    "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User",
    "CCBot", "Bytespider", "Google-Extended", "GoogleOther", "Googlebot", "bingbot", "Applebot", "Amazonbot", "meta-externalagent",
    "FacebookBot", "cohere-ai", "Diffbot", "ImagesiftBot", "Omgilibot", "YouBot", "DuckAssistBot", "YandexBot", "Baiduspider",
    "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "ia_archiver", "archive\\.org_bot",
    // Skript och automatiserade webbläsare
    "curl/", "Wget", "python-requests", "python-urllib", "aiohttp", "httpx", "Scrapy", "Go-http-client", "libwww-perl", "Java/",
    "okhttp", "axios", "HeadlessChrome", "PhantomJS", "Puppeteer", "Playwright", "Selenium", "HTTrack", "SiteSucker", "WebCopier",
  ].join("|"),
  "i",
);

/**
 * Det crawlers ska få läsa (robots.txt), och flödets API:er som andra system anropar med vanliga HTTP-klienter (curl,
 * Java, okhttp …): webhooks, New Waves hubb och dess fillänkar, butikens ordrar, producenternas kö, katalogen och
 * scheman. De kontrollerar själva nyckel, signatur eller inloggning (lib/access.ts, lib/poc/auth.ts).
 */
const ALLOWED = [
  "/robots.txt",
  "/api/v1/webhooks/",
  "/api/v1/newwave/hub/filer/",
  "/api/v1/hub/",
  "/api/v1/orders",
  "/api/v1/producers/",
  "/api/v1/catalog",
  "/api/v1/craft/sasong/kor",
  "/api/v1/poc/rensa",
];

/** Next bildoptimerare hämtar bilderna från sidan själv, utan user-agent. */
const IMAGE = /^\/(?!api\/)[^?#]+\.(?:jpe?g|png|webp|avif|gif|svg|ico)$/i;

export const isBlockedBot = (path: string, userAgent: string | null) =>
  !ALLOWED.some((p) => path.startsWith(p)) && (userAgent?.trim() ? BLOCKED.test(userAgent) : !IMAGE.test(path));
