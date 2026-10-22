// Kör: node scripts/wordmark-bench.mjs [--fresh] [--only fall-id] [--file sökväg=fall.json ...]
// Testbänken för importen: varje design körs genom "Gör en design för flera klubbar" i webbläsaren mot dev-servern och
// jämförs med facit – rätt text i rätt plats, typsnitt, färgplats, klubbmärke och hur väl mallen återskapar originalet.
// Facit kommer från egna mallar som ritats ut som platta SVG-filer, där svaret är känt, och från riktiga designer med
// facit i en JSON-fil. Läsningarna sparas i läsagentens minne, så bara första körningen kostar AI-anrop (ca 1,50 kr per
// design); --fresh läser om allt för att mäta en ändring i agenten. Servern väljs med NW_BENCH_URL.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const BASE = process.env.NW_BENCH_URL || "http://localhost:3210";
const OUT = path.join(ROOT, ".data", "newwave", "bench");
const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const jiti = createJiti(import.meta.url, { alias: { "@/": `${ROOT}/` }, fsCache: false });
const { paletteFor, renderWordmark, textFill, textsFor } = await jiti.import("../lib/newwave/wordmark/render.ts");
const { FONTS, fontFor } = await jiti.import("../lib/newwave/wordmark/fonts.ts");
const { findTemplate, wordmarkClub } = await jiti.import("../lib/newwave/wordmark/store.ts");

/** Egna mallar för olika klubbar: olika typsnitt, former, bågar och märken. */
const GENERATED = [
  ["retro-skript", "ifk-goteborg"],
  ["baseboll", "onsala-bk"],
  ["kapsel", "tolo-if"],
  ["college-bage", "varbergs-gif"],
  ["skold", "lerums-is"],
  ["hockeyranderna", "alingsas-hk"],
  ["sjuttiotal", "stenungsunds-if"],
  ["campus", "kungsbacka-if"],
];

/**
 * Facit för en egen mall: texten, typsnittet och färgplatsen för varje textlager, och om mallen har ett märke. Färgen
 * jämförs som den ritas för klubben – en vit andrafärg blir svart på ljust plagg och läses då rätt som svart.
 */
function facitFor(template, club) {
  const texts = textsFor(club, {});
  const facit = { texts: {}, fonts: {}, colors: {}, palette: paletteFor(club.colors, "light"), icon: template.layers.some((l) => l.kind === "icon") };
  for (const l of template.layers) {
    if (l.kind !== "text" || !texts[l.slot]?.trim() || facit.texts[l.slot]) continue;
    const id = fontFor(l.font);
    facit.texts[l.slot] = texts[l.slot];
    facit.fonts[l.slot] = { id, role: FONTS[id].role };
    facit.colors[l.slot] = l.color;
  }
  return facit;
}

async function cases() {
  await mkdir(path.join(OUT, "files"), { recursive: true });
  const out = [];
  for (const [templateId, clubId] of GENERATED) {
    const [template, club] = [await findTemplate(templateId), await wordmarkClub(clubId)];
    if (!template || !club) {
      console.log(`hoppar över ${templateId} – ${clubId}: finns inte`);
      continue;
    }
    const file = path.join(OUT, "files", `${templateId}--${clubId}.svg`);
    await writeFile(file, (await renderWordmark(template, club, { icon: true, ornament: true, variant: "light" })).svg);
    out.push({ id: `${templateId}--${clubId}`, file, facit: facitFor(template, club) });
  }
  for (const a of args.filter((_, i) => args[i - 1] === "--file")) {
    const [file, facit] = a.split("=");
    out.push({ id: path.basename(file), file, facit: JSON.parse(await readFile(facit, "utf8")) });
  }
  return out.filter((c) => !only || c.id === only);
}

const same = (a, b) => (a ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("sv-SE") === (b ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("sv-SE");
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Poäng 0–1 per mått; ett mått utan något att mäta räknas inte. */
function score(facit, template, texts) {
  const layers = template.layers.filter((l) => l.kind === "text");
  const slots = Object.keys(facit.texts);
  const text = slots.map((s) => (layers.some((l) => l.slot === s) && same(texts[s], facit.texts[s]) ? 1 : Object.values(texts).some((t) => same(t, facit.texts[s])) ? 0.5 : 0));
  const font = slots.flatMap((s) => {
    const l = layers.find((x) => x.slot === s);
    if (!l || !facit.fonts[s]) return [];
    const id = fontFor(l.font);
    return [facit.fonts[s].id ? (id === facit.fonts[s].id ? 1 : FONTS[id].role === facit.fonts[s].role ? 0.5 : 0) : FONTS[id].role === facit.fonts[s].role ? 1 : 0];
  });
  const color = slots.flatMap((s) => {
    const l = layers.find((x) => x.slot === s);
    if (!l || !facit.colors[s]) return [];
    return [facit.palette ? (textFill(facit.palette, l.color) === textFill(facit.palette, facit.colors[s]) ? 1 : 0) : l.color === facit.colors[s] ? 1 : 0];
  });
  const detail = Object.fromEntries(
    slots.map((s) => {
      const l = layers.find((x) => x.slot === s);
      return [s, { want: { text: facit.texts[s], font: facit.fonts[s]?.id ?? facit.fonts[s]?.role, color: facit.colors[s] }, got: l ? { text: texts[s], font: fontFor(l.font), color: l.color } : null }];
    }),
  );
  return { text: mean(text), font: mean(font), color: mean(color), icon: template.layers.some((l) => l.kind === "icon") === facit.icon ? 1 : 0, detail };
}

async function run(browser, c) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let memory = "–";
  const matched = [];
  page.on("response", async (r) => {
    if (!r.url().endsWith("/api/v1/newwave/wordmark/match")) return;
    const parts = r.request().postDataJSON().parts;
    const { matches } = await r.json().catch(() => ({ matches: [] }));
    parts.forEach((p, i) => matched.push({ text: p.text, prefer: p.prefer, paint: p.paint, colors: [...new Set(p.svg.match(/\{[a-z]+\}/g) ?? [])], top: (matches[i] ?? []).slice(0, 3).map((o) => `${o.font} ${o.score}`) }));
  });
  await page.route("**/api/v1/newwave/wordmark/read", async (r) => {
    const res = await r.fetch(fresh ? { postData: JSON.stringify({ ...r.request().postDataJSON(), fresh: true }) } : undefined);
    const json = await res.json().catch(() => ({}));
    memory = json.memory ?? `fel ${res.status()}`;
    await r.fulfill({ response: res, json });
  });
  const started = Date.now();
  try {
    await page.goto(`${BASE}/newwave/craft/designa/ordmarken`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Gör en design för flera klubbar/ }).click();
    await page.getByLabel(/Vi har rätt att använda designen/).check();
    await page.locator('input[type=file][accept*=".svg"]').first().setInputFiles(c.file);
    const done = page.locator("[data-likeness]").first();
    const failed = page.locator("p.text-\\[13\\.5px\\].text-\\[\\#B42318\\]").first();
    await Promise.race([done.waitFor({ timeout: 180_000 }), failed.waitFor({ timeout: 180_000 })]);
    if (await failed.isVisible().catch(() => false)) throw new Error(await failed.textContent());
    const likeness = Number(await done.getAttribute("data-likeness"));
    const texts = JSON.parse((await done.getAttribute("data-texts")) ?? "{}");
    await page.getByRole("textbox", { name: "Designens namn" }).fill(`Testbänk ${c.id}`.slice(0, 40));
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/v1/newwave/wordmark/templates") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Spara och välj klubbar" }).click();
    const { template } = await (await saved).json();
    await page.request.delete(`${BASE}/api/v1/newwave/wordmark/templates?id=${encodeURIComponent(template.id)}`);
    return { id: c.id, memory, seconds: Math.round((Date.now() - started) / 100) / 10, likeness, ...score(c.facit, template, texts), texts, matched, made: template.made };
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `${c.id}.png`), fullPage: true }).catch(() => undefined);
    return { id: c.id, memory, error: (e instanceof Error ? e.message : String(e)).split("\n")[0] };
  } finally {
    await page.close();
  }
}

const pct = (v) => (v === null || v === undefined ? "  –" : `${Math.round(v * 100)}`.padStart(3));
const list = await cases();
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
for (const c of list) {
  const r = await run(browser, c);
  results.push(r);
  console.log(r.error ? `${c.id.padEnd(36)} FEL: ${r.error}` : `${c.id.padEnd(36)} text ${pct(r.text)} · typsnitt ${pct(r.font)} · färg ${pct(r.color)} · märke ${pct(r.icon)} · likhet ${String(r.likeness).padStart(3)} % · ${r.memory} · ${r.seconds} s`);
}
await browser.close();
const ok = results.filter((r) => !r.error);
const total = { text: mean(ok.map((r) => r.text).filter((v) => v !== null)), font: mean(ok.map((r) => r.font).filter((v) => v !== null)), color: mean(ok.map((r) => r.color).filter((v) => v !== null)), icon: mean(ok.map((r) => r.icon)), likeness: mean(ok.map((r) => r.likeness / 100)) };
console.log(`\nTräffsäkerhet över ${ok.length} av ${results.length} designer: text ${pct(total.text)} % · typsnitt ${pct(total.font)} % · färg ${pct(total.color)} % · märke ${pct(total.icon)} % · likhet ${pct(total.likeness)} %`);
const report = path.join(OUT, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(report, JSON.stringify({ at: new Date().toISOString(), base: BASE, fresh, total, results }, null, 2));
console.log(`Rapport: ${path.relative(ROOT, report)}`);
