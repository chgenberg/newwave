/** Quick sanity checks for the package maths: `npx jiti lib/demoPackages.check.ts`. */
import assert from "node:assert/strict";
import { ALL_PRODUCTS } from "./demoCatalog";
import { EVENT_IDS, EVENTS } from "./demoEvents";
import { buildPackage, delivery, fitBudget, packageSummary, packageTotal } from "./demoPackages";

const rec = ["profilklader", "kepsar", "vattenflaskor", "muggar", "pennor"];

const bas = buildPackage("bas", rec);
const std = buildPackage("standard", rec);
const full = buildPackage("komplett", rec);
assert.deepEqual(bas.map((l) => l.id), ["massvagg", "massdisk", "rollup", "profilklader", "kepsar"]);
assert.ok(packageTotal(bas) < packageTotal(std) && packageTotal(std) < packageTotal(full), "packages grow in price");

const many = buildPackage("standard", rec, "10000+");
assert.equal(many.find((l) => l.id === "pennor")!.qty, 1500, "pens scale with visitors");
assert.equal(many.find((l) => l.id === "profilklader")!.qty, 20, "apparel does not scale with visitors");
assert.equal(buildPackage("standard", rec, "lt500").find((l) => l.id === "vattenflaskor")!.qty, 50);

for (const budget of [10_000, 25_000, 30_000, 60_000, 150_000]) {
  const a = fitBudget(full, budget);
  const b = fitBudget(full, budget);
  assert.deepEqual(a, b, "deterministic");
  assert.ok(packageTotal(a.lines) <= budget || a.lines.length === 1, `fits ${budget}: ${packageTotal(a.lines)}`);
  assert.equal(a.lines[0].id, "massvagg", "the wall is always kept");
}
for (const budget of [25_000, 40_000]) assert.ok(budget - packageTotal(fitBudget(full, budget).lines) < 1_500, `uses most of ${budget}`);
const tight = fitBudget(std, 25_000);
assert.ok(tight.adjusted && tight.lines.some((l) => l.id === "massdisk"), "booth essentials first");
assert.deepEqual(fitBudget(bas, 150_000), { lines: bas, adjusted: false }, "no change under budget");

const d = delivery("2026-11-20", ["massvagg"], new Date(2026, 9, 6));
assert.deepEqual(d, { orderBy: "2026-11-06", late: false, leadDays: 10 });
assert.equal(delivery("2026-10-12", ["pennor"], new Date(2026, 9, 6))!.late, true, "too late for merch");
assert.equal(delivery("2026-02-30", ["pennor"]), null, "invalid date");

const perEvent: Record<string, number[]> = {};
for (const ev of EVENT_IDS) {
  const e = EVENTS[ev];
  for (const id of [...e.set, ...e.merch, ...e.defaults, ...e.basSet]) assert.ok(ALL_PRODUCTS.some((p) => p.id === id), `${ev}: unknown product ${id}`);
  for (const id of e.set) assert.ok(ALL_PRODUCTS.find((p) => p.id === id)!.booth === id, `${ev}: ${id} is a set piece`);
  const [b, s, k] = (["bas", "standard", "komplett"] as const).map((id) => buildPackage(id, [], null, ev));
  assert.ok(packageTotal(b) < packageTotal(s) && packageTotal(s) < packageTotal(k), `${ev}: packages grow in price`);
  assert.ok(b.every((l) => [...e.set, ...e.merch].includes(l.id)) && k.every((l) => [...e.set, ...e.merch].includes(l.id)), `${ev}: only its own products`);
  assert.equal(fitBudget(k, 20_000, ev).lines[0].id, e.set[0], `${ev}: main piece kept`);
  assert.ok(packageSummary(s, ev).length > 0);
  perEvent[ev] = [packageTotal(b), packageTotal(s), packageTotal(k)];
}
assert.deepEqual(buildPackage("standard", ["glas", "lanyard"], null, "konferens").filter((l) => !(EVENTS.konferens.set as string[]).includes(l.id)).map((l) => l.id), ["lanyard"], "foreign recommendations are dropped");
assert.equal(buildPackage("standard", [], null, "kickoff").find((l) => l.id === "bordsduk")!.qty, 4, "per-event quantities");
assert.ok(buildPackage("standard", [], "300+" as never, "kickoff").length > 0);
assert.equal(delivery("2026-11-20", ["hoodies"], new Date(2026, 9, 6), "kickoff")!.leadDays, 10, "kick-off merch lead time");

console.log("demoPackages: all checks passed", perEvent, { bas: packageTotal(bas), standard: packageTotal(std), komplett: packageTotal(full), fit25k: packageTotal(tight.lines), fit25kLines: tight.lines });
