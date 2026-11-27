/**
 * Tar bort POC-flödets demodata inför skarp start: provordrarna med rader, produktionsjobb och tidslinje,
 * innehållspaketen och mejlutkasten, säsongsplanerna, miljöbilderna och loggen över modellanrop. Med
 * `--med-designer` även designerna och klubbprodukterna (det som ligger i shopparna).
 *
 * Torrkörning som standard: skriptet visar databasen det är anslutet till, vad som skulle tas bort och vad som får stå
 * kvar, men ändrar ingenting. Först med `--ta-bort` tas det bort, i en enda transaktion (allt eller inget).
 *
 *   node --env-file=.env.local node_modules/.bin/jiti scripts/poc-rensa-demodata.ts
 *     --ta-bort                  tar bort på riktigt
 *     --med-designer             även designerna och klubbprodukterna
 *     --även=<tabell,tabell>     även tabeller ur listan "Rörs inte" (t.ex. hubbens), med hela innehållet
 *     --produktion=<värdnamn>    krävs mot en databas som inte ligger på den här datorn (även för torrkörningen):
 *                                värdnamnet som skriptet skrev ut, så att det inte går att träffa fel databas av misstag
 *
 * Skriptet använder bara databasen i `DATABASE_URL` och skriver ut dess värdnamn, aldrig lösenordet. I produktion körs
 * det i tjänstens skal på Railway (`railway ssh`, där DATABASE_URL redan är satt) – se docs/drift.md, "Skarp start".
 *
 * Ordernumren börjar inte om: New Waves hubb känner igen en order på vårt ordernummer, så ett nummer som redan använts
 * i en provkörning mot hubben får aldrig gå till en riktig order. Filerna på volymen (miljöbilderna i .data/files)
 * ligger kvar men är inte längre länkade någonstans.
 */
import { Client } from "pg";

// ── Flaggorna ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const KNOWN = ["ta-bort", "med-designer", "även", "produktion", "hjälp"];
const unknown = args.filter((a) => !KNOWN.includes(a.replace(/^--/, "").split("=")[0]));
if (flag("hjälp") || unknown.length) {
  if (unknown.length) console.error(`Okänd flagga: ${unknown.join(" ")}\n`);
  console.error("Användning: node --env-file=.env.local node_modules/.bin/jiti scripts/poc-rensa-demodata.ts [--ta-bort] [--med-designer] [--även=tabell,tabell] [--produktion=<värdnamn>]");
  process.exit(unknown.length ? 2 : 0);
}
const REMOVE = flag("ta-bort");
const WITH_DESIGNS = flag("med-designer");
const EXTRA = (value("även") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ── Databasen ───────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL saknas. Lokalt: node --env-file=.env.local node_modules/.bin/jiti scripts/poc-rensa-demodata.ts");
  process.exit(2);
}
let target: { host: string; port: string; db: string };
try {
  const u = new URL(url);
  // Värden kan också ligga i ?host= (unix-uttag).
  const host = decodeURIComponent(u.hostname) || u.searchParams.get("host") || "localhost";
  target = { host, port: u.port || "5432", db: decodeURIComponent(u.pathname.replace(/^\//, "")) || "(standard)" };
} catch {
  console.error("DATABASE_URL går inte att läsa som en adress (postgres://…).");
  process.exit(2);
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Allt som inte ligger på den här datorn räknas som produktion, liksom allt som körs i en produktionsmiljö. */
const production = !(LOCAL.has(target.host) || target.host.startsWith("/")) || process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT_NAME === "production";

console.log(`Databasen: ${target.host}, port ${target.port}, databas ${target.db}${production ? " – räknas som PRODUKTION" : " – på den här datorn"}`);
if (production && value("produktion") !== target.host) {
  console.error(
    value("produktion") === undefined
      ? `\nVägrar: det här räknas som en produktionsdatabas. Kör igen med --produktion=${target.host} om det verkligen är den här databasen som ska rensas.`
      : `\nVägrar: --produktion=${value("produktion")} stämmer inte med databasens värdnamn (${target.host}).`,
  );
  process.exit(3);
}
console.log(REMOVE ? "Läge: TA BORT – det som listas nedan tas bort\n" : "Läge: torrkörning – inget tas bort (lägg till --ta-bort för att ta bort)\n");

// ── Vad som tas bort ────────────────────────────────────────────────────────

type Group = { label: string; tables: { name: string; label: string; cascade?: boolean }[] };

/** I den här ordningen: det som pekar på något annat tas bort först. */
const GROUPS: Group[] = [
  {
    label: "Provordrar och provjobb",
    tables: [
      { name: "orders", label: "ordrar" },
      { name: "order_lines", label: "orderrader", cascade: true },
      { name: "production_jobs", label: "produktionsjobb", cascade: true },
      { name: "order_events", label: "händelser i tidslinjen", cascade: true },
    ],
  },
  {
    label: "Innehåll och utkast",
    tables: [
      { name: "poc_content_drafts", label: "innehållspaket och mejlutkast" },
      { name: "poc_scene_photos", label: "miljöbilder" },
      { name: "poc_model_calls", label: "loggen över modellanrop" },
    ],
  },
  { label: "Säsonger", tables: [{ name: "poc_season_plans", label: "säsongsplaner" }] },
];
const DESIGNS: Group = {
  label: "Designer och klubbprodukter",
  tables: [
    { name: "club_products", label: "klubbprodukter (shopparnas produkter)" },
    { name: "designs", label: "designer" },
  ],
};

const db = new Client({ connectionString: url, application_name: "poc-rensa-demodata" });
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const fmt = (n: number) => n.toLocaleString("sv-SE");
const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  await db.connect();
  const [{ server_version: version }] = (await db.query<{ server_version: string }>("SHOW server_version")).rows;
  console.log(`Ansluten: PostgreSQL ${version}, databas ${(await db.query("SELECT current_database() AS d")).rows[0].d}\n`);

  const tables = (await db.query<{ name: string }>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1")).rows.map((r) => r.name);
  const exists = new Set(tables);
  const count = async (t: string) => Number((await db.query(`SELECT count(*)::bigint AS n FROM ${ident(t)}`)).rows[0].n);

  const known = new Set([...GROUPS, DESIGNS].flatMap((g) => g.tables.map((t) => t.name)));
  // Andra delars tabeller med en kolumn order_id hör till ordrarna (t.ex. hubbens utkorg) och tas bort med dem.
  const byOrder = (await db.query<{ name: string }>("SELECT DISTINCT table_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'order_id' ORDER BY 1")).rows
    .map((r) => r.name)
    .filter((t) => !known.has(t) && exists.has(t));
  const badExtra = EXTRA.filter((t) => !exists.has(t) || known.has(t) || byOrder.includes(t));
  if (badExtra.length) {
    console.error(`--även går bara med tabeller ur listan "Rörs inte": ${badExtra.join(", ")}`);
    process.exit(2);
  }

  const groups: Group[] = [
    { ...GROUPS[0], tables: [...byOrder.map((name) => ({ name, label: "hör till ordrarna (kolumnen order_id)" })), ...GROUPS[0].tables] },
    ...GROUPS.slice(1),
    ...(WITH_DESIGNS ? [DESIGNS] : []),
    ...(EXTRA.length ? [{ label: "Även (--även)", tables: EXTRA.map((name) => ({ name, label: "hela tabellen" })) }] : []),
  ];

  // Listan.
  console.log("Tas bort:");
  let total = 0;
  for (const g of groups) {
    console.log(`  ${g.label}`);
    for (const t of g.tables) {
      if (!exists.has(t.name)) {
        console.log(`    ${t.name.padEnd(28)} finns inte`);
        continue;
      }
      const n = await count(t.name);
      total += n;
      console.log(`    ${t.name.padEnd(28)} ${fmt(n).padStart(8)}  ${t.label}${t.cascade ? " (följer med ordrarna)" : ""}`);
    }
  }

  if (exists.has("orders")) {
    const orders = (
      await db.query<{ number: string; club_id: string; status: string; total_sek: string; created_at: Date }>("SELECT number, club_id, status, total_sek, created_at FROM orders ORDER BY created_at")
    ).rows;
    if (orders.length) {
      console.log(`\n  Ordrarna (${fmt(orders.length)}, utan kunduppgifter):`);
      for (const o of orders.slice(0, 60)) console.log(`    ${o.number.padEnd(12)} ${day(o.created_at)}  ${o.status.padEnd(15)} ${String(Number(o.total_sek)).padStart(7)} kr  ${o.club_id}`);
      if (orders.length > 60) console.log(`    … och ${fmt(orders.length - 60)} till`);
    }
  }
  if (exists.has("poc_content_drafts")) {
    const drafts = (await db.query<{ design_name: string; n: string; sent: string }>("SELECT design_name, count(*) AS n, count(*) FILTER (WHERE status = 'skickat') AS sent FROM poc_content_drafts GROUP BY design_name ORDER BY 1")).rows;
    if (drafts.length) {
      console.log("\n  Innehållspaketen per design:");
      for (const d of drafts) console.log(`    ${d.design_name}: ${fmt(Number(d.n))} utkast, ${fmt(Number(d.sent))} markerade som skickade`);
    }
  }
  if (exists.has("poc_season_plans")) {
    const plans = (await db.query<{ season_label: string | null; design_name: string; status: string; run_at: Date }>("SELECT season_label, design_name, status, run_at FROM poc_season_plans ORDER BY run_at")).rows;
    if (plans.length) {
      console.log("\n  Säsongsplanerna:");
      for (const p of plans) console.log(`    ${day(p.run_at)}  ${p.status.padEnd(10)} ${p.season_label ?? "–"}: ${p.design_name}`);
    }
  }
  if (WITH_DESIGNS && exists.has("designs")) {
    const designs = (await db.query<{ name: string; products: string }>("SELECT d.name, (SELECT count(*) FROM club_products c WHERE c.design_id = d.id) AS products FROM designs d ORDER BY d.created_at")).rows;
    if (designs.length) {
      console.log("\n  Designerna:");
      for (const d of designs) console.log(`    ${d.name}: ${fmt(Number(d.products))} klubbprodukter`);
    }
  }

  // Det som får stå kvar.
  const removed = new Set(groups.flatMap((g) => g.tables.map((t) => t.name)));
  const kept = tables.filter((t) => !removed.has(t));
  if (kept.length) {
    console.log("\nRörs inte:");
    for (const t of kept) {
      const hint = DESIGNS.tables.some((d) => d.name === t) ? "(med --med-designer)" : known.has(t) ? "" : `(med --även=${t})`;
      console.log(`    ${t.padEnd(28)} ${fmt(await count(t)).padStart(8)}  ${hint}`);
    }
  }
  const seq = (await db.query<{ last_value: string; is_called: boolean }>("SELECT last_value, is_called FROM order_number_seq").catch(() => ({ rows: [] }))).rows[0];
  if (seq) console.log(`\nOrdernumren börjar inte om: nästa order får IS-${Number(seq.last_value) + (seq.is_called ? 1 : 0)}.`);
  if (exists.has("poc_scene_photos")) {
    const files = Number((await db.query("SELECT count(*) AS n FROM poc_scene_photos WHERE url LIKE '/api/v1/files/%'")).rows[0].n);
    if (files) console.log(`Miljöbildernas ${fmt(files)} filer ligger kvar på volymen (.data/files) men länkas inte längre.`);
  }

  if (!REMOVE) {
    console.log(`\nTorrkörning: ${fmt(total)} rader skulle tas bort. Inget är ändrat.`);
    return;
  }

  // Borttagningen, i en transaktion.
  await db.query("BEGIN");
  try {
    for (const g of groups)
      for (const t of g.tables) {
        if (!exists.has(t.name) || t.cascade) continue;
        const res = await db.query(`DELETE FROM ${ident(t.name)}`);
        console.log(`  borttaget ur ${t.name}: ${fmt(res.rowCount ?? 0)}`);
      }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    console.error(`\nInget togs bort – felet: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nKlart. Kvar efteråt:");
  for (const t of removed) if (exists.has(t)) console.log(`    ${t.padEnd(28)} ${fmt(await count(t)).padStart(8)}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.end().catch(() => {}));
