import type { Browser } from "playwright-core";

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  const executablePath = process.env.CHROMIUM_PATH;
  return executablePath ? chromium.launch({ executablePath, args }) : chromium.launch({ channel: "chrome", args });
}

/** A4-PDF av fristående HTML. Bara `data:`-adresser laddas, så bilderna måste vara inbäddade. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  } finally {
    await browser.close();
  }
}
