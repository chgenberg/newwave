/**
 * Halsduksagentens demokörning: hela flödet på riktigt för några klubbar – signaler, idéer från språkmodellen,
 * stickning, maskinkontroll, granskare och stickfiler. Varje steg sparas under /tmp/nw-scarf, så en avbruten
 * körning fortsätter där den slutade utan att betala igen.
 *
 * Resultatet: lib/scarfDemo.json (idéerna med betyg), public/halsduk/demo/*.jpg (korrektur) och
 * ../offert/halsdukar-demo/ (stickfilerna som zip per halsduk).
 *
 *   set -a; . ./.env.local; set +a; JITI_ALIAS='{"@/":"<repo>/"}' node_modules/.bin/jiti scripts/scarf-demo.ts ifk-goteborg:5:trupp+portratt asa-if:3:personlig
 *
 * Efter kolon: antal halsdukar och recept som beställaren vill ha med.
 * --append lägger till i den befintliga kollektionen, --batch=2 håller de nya idéerna isär i mellanlagringen.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { CLUBS } from "@/lib/club";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { htmlToPdf } from "@/lib/pdf";
import { createScarfIdeas, demoScarfIdeas, drawScarfMotif, reviewScarf, reviseScarfIdea, scarfSignals, type ScarfReview } from "@/lib/scarfAgent";
import type { DemoScarf } from "@/lib/scarfDemo";
import { facePreview } from "@/lib/scarfEngine";
import { knitIdea, proof } from "@/lib/scarfFlow";
import { buildPackage, slug } from "@/lib/scarfProduction";
import { RECIPES, type RecipeId, type ScarfIdea } from "@/lib/scarfRecipes";
import type { Signal } from "@/lib/types";

const TMP = "/tmp/nw-scarf";
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public", "halsduk", "demo");
const SEND = path.join(ROOT, "..", "offert", "halsdukar-demo");
const today = new Date().toISOString().slice(0, 10);

async function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  const p = path.join(TMP, file);
  if (existsSync(p)) return JSON.parse(await readFile(p, "utf8")) as T;
  const v = await make();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(v, null, 2));
  return v;
}

async function cachedFile(file: string, make: () => Promise<Buffer>): Promise<Buffer> {
  const p = path.join(TMP, file);
  if (existsSync(p)) return readFile(p);
  const v = await make();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, v);
  return v;
}

async function main() {
  const args = process.argv.slice(2);
  const plan = args.filter((a) => !a.startsWith("--")).map((a) => a.split(":")).map(([id, n, want]) => ({ id, n: Number(n ?? 3), want: (want ? want.split("+") : []) as RecipeId[] }));
  if (!plan.length) throw new Error("Ange klubbar, t.ex. ifk-goteborg:5 asa-if:3");
  // --append lägger till i den befintliga kollektionen; --batch=2 ger de nya idéerna en egen mellanlagring.
  const batch = args.find((a) => a.startsWith("--batch="))?.slice(8) ?? "1";
  const previous: DemoScarf[] = args.includes("--append") ? ((JSON.parse(await readFile(path.join(ROOT, "lib", "scarfDemo.json"), "utf8")) as { scarves: DemoScarf[] }).scarves ?? []) : [];
  await Promise.all([mkdir(PUBLIC, { recursive: true }), mkdir(SEND, { recursive: true })]);
  const out: DemoScarf[] = [...previous];
  const used: RecipeId[] = previous.map((s) => s.idea.recipe);
  const log: string[] = [];

  for (const { id, n, want } of plan) {
    const club = CLUBS[id];
    if (!club) throw new Error(`Okänd klubb ${id}`);
    const { signals } = await cached<{ signals: Signal[] }>(`${id}/signals.json`, async () => ({ signals: (await scarfSignals(club)).signals }));
    console.log(`\n${club.name}: ${signals.length} signaler – ${signals.map((s) => s.title).join(" · ")}`);
    const { mode, ideas } = await cached<{ mode: "ai" | "demo"; ideas: ScarfIdea[] }>(`${id}/ideas-${batch}.json`, async () => {
      if (hasOpenAIKey()) {
        const ideas = await createScarfIdeas(club, signals, n, used, want);
        if (ideas.length) return { mode: "ai" as const, ideas };
      }
      return { mode: "demo" as const, ideas: demoScarfIdeas(club, signals, n) };
    });
    console.log(`  ${ideas.length} idéer (${mode}): ${ideas.map((i) => `${i.title} [${i.recipe}]`).join(" · ")}`);

    for (const first of ideas) {
      used.push(first.recipe);
      const motif = (idea: ScarfIdea, key: string) =>
        idea.recipe === "motiv" && idea.art && hasOpenAIKey()
          ? cachedFile(`${key}/motiv.png`, () => drawScarfMotif(idea, { ink: idea.colors.ink, accent: idea.colors.accent, ground: idea.colors.ground })).catch((e) => {
              console.log("  motiv misslyckades:", errorMessage(e));
              return null;
            })
          : Promise.resolve(null);
      const judge = (idea: ScarfIdea, key: string, sheet: Buffer) =>
        hasOpenAIKey()
          ? cached<ScarfReview | null>(`${key}/review.json`, () => reviewScarf(club, idea, sheet)).catch((e) => {
              console.log("  granskaren svarade inte:", errorMessage(e));
              return null;
            })
          : Promise.resolve(null);

      let idea = first;
      let key = `${id}/${slug(idea.title)}`;
      let art = await motif(idea, key);
      let result = await knitIdea(club, idea, { art });
      let review = await judge(idea, key, await proof(result.knit));
      let firstReview: ScarfReview | null = null;
      // Underkänd: agenten gör om halsduken en gång med granskarens punkter, precis som i flödet på sajten.
      if (review?.verdict === "underkänd") {
        const revised = await cached<ScarfIdea | null>(`${key}/revised.json`, () => reviseScarfIdea(club, idea, review!)).catch(() => null);
        if (revised) {
          console.log(`  ${idea.title}: underkänd (${review.summary}) → görs om som "${revised.title}" [${revised.recipe}]`);
          firstReview = review;
          idea = revised;
          key = `${key}/v2`;
          art = await motif(idea, key);
          result = await knitIdea(club, idea, { art });
          review = await judge(idea, key, await proof(result.knit));
        }
      }
      const { built, knit, report, front, back } = result;

      const name = `${id}-${slug(idea.title)}`;
      const [f, b] = await Promise.all(knit.faces.map((face) => facePreview(face, knit.palette, 2000)));
      await Promise.all([
        sharp(f).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, `${name}-fram.jpg`)),
        sharp(b).flatten({ background: "#F5F5F7" }).jpeg({ quality: 88 }).toFile(path.join(PUBLIC, `${name}-bak.jpg`)),
        ...(built.uses.art && art ? [writeFile(path.join(PUBLIC, `${name}-motiv.png`), art)] : []),
      ]);
      const pack = await buildPackage({ club: club.name, title: idea.title, why: idea.why, front, back, consent: built.consent, knit, report, date: today, pdf: htmlToPdf });
      const zip = new JSZip();
      for (const file of pack.files) zip.file(file.name, file.data);
      await writeFile(path.join(SEND, `stickfiler-${pack.base}.zip`), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      const pdf = pack.files.find((x) => x.name === "stickorder.pdf");
      if (pdf) await writeFile(path.join(SEND, `stickorder-${pack.base}.pdf`), pdf.data);

      out.push({
        slug: name,
        clubId: id,
        club: club.name,
        idea,
        level: RECIPES[idea.recipe].level,
        recipeLabel: RECIPES[idea.recipe].label,
        mode,
        firstReview,
        palette: knit.palette,
        yarns: report.yarns.map((y) => ({ hex: y.hex, pantone: y.pantone, share: Math.round(y.share * 1000) / 1000 })),
        system: report.maxColorsPerRow <= 4 ? "dubbel" : "enkel",
        maxColorsPerRow: report.maxColorsPerRow,
        minTextMm: knit.minTextMm === null ? null : Math.round(knit.minTextMm),
        ok: report.ok,
        consent: built.consent,
        art: built.uses.art,
        review,
        text: { front, back },
      });
      const warn = report.checks.filter((c) => c.level === "varning").map((c) => c.title);
      const line = `  ${(firstReview ? "v2 " : "") + idea.title.padEnd(26)} ${idea.recipe.padEnd(10)} ${knit.palette.length} garn  ${report.maxColorsPerRow}/varv  text ${knit.minTextMm?.toFixed(0) ?? "–"} mm  jpg-avvikelse ${pack.jpgDrift}  ${warn.length ? `VARNING: ${warn.join(", ")}` : "ok"}${review ? `  betyg sälj ${review.sales} profil ${review.brandFit} läsb ${review.legibility} hantv ${review.craft} → ${review.verdict}` : ""}`;
      console.log(line);
      log.push(line);
    }
  }
  await writeFile(path.join(ROOT, "lib", "scarfDemo.json"), `${JSON.stringify({ date: today, scarves: out }, null, 2)}\n`);
  console.log(`\n${out.length} halsdukar. Korrektur i ${PUBLIC}, stickfiler i ${SEND}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
