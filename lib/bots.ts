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

/** Det crawlers ska få läsa (robots.txt) och andra system som hämtar härifrån: webhooks och New Waves produktionsfiler. */
const ALLOWED = ["/robots.txt", "/api/v1/webhooks/", "/api/v1/newwave/hub/filer/"];

export const isBlockedBot = (path: string, userAgent: string | null) =>
  !ALLOWED.some((p) => path.startsWith(p)) && (!userAgent?.trim() || BLOCKED.test(userAgent));
