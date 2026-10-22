"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type BrandKit, isOwnKit } from "@/lib/newwave/brandKit";
import type { ClubItem } from "@/lib/newwave/clubRegistry";
import { registryAsset } from "@/lib/newwave/clubAssets";
import { type NwProduct, nwProduct } from "@/lib/newwave/catalog";
import { designSummary } from "@/lib/newwave/marking";
import { photoMockup } from "@/lib/newwave/photoMockup";
import { logoFor, priceLine, type QuoteLineInput, sek, splitSizes } from "@/lib/newwave/reseller";
import { call, upload } from "../shop/api";
import { PLACEHOLDER } from "../shop/cart";
import { ProductMock } from "../shop/ProductMock";
import type { WorkspaceClub } from "./roles";
import { Empty, GHOST, H, type Item, LEAD, logoOf, PAGE, SOLID, wordmarkLogos } from "./Tabs";

const FIELD = "h-11 w-full min-w-0 rounded-xl border border-[rgba(17,17,17,0.14)] bg-white px-3 text-[14.5px] outline-none transition focus:border-[#111]";
const LABEL = "grid gap-1.5 text-[13px] font-semibold";

/** Loggan som trycks på produkten: designens egen, annars varumärkets, annars platshållaren. */
const printLogos = (kit: BrandKit, item: Item) => {
  const { logo, logoDark } = logoOf(kit, item.design);
  return { logo, logoDark: logoDark ?? undefined };
};

/** Bilden som följer med produkten: studions egen bild, annars loggan på produktfotot. Laddas upp som fil. */
async function itemImage(item: Item, kit: BrandKit) {
  const p = nwProduct(item.id)!;
  const logos = printLogos(kit, item);
  return upload(item.preview ?? (await photoMockup(p, logoFor(p, logos) ?? logos.logo, p.dark, item.design.zone)));
}

/** Kör ett steg per produkt och visar hur långt det kommit. */
function useSteps() {
  const [state, setState] = useState<{ busy: boolean; done: number; total: number; error: string }>({ busy: false, done: 0, total: 0, error: "" });
  const run = async <T,>(list: Item[], step: (i: Item) => Promise<T>) => {
    setState({ busy: true, done: 0, total: list.length, error: "" });
    const out: T[] = [];
    try {
      for (const i of list) {
        out.push(await step(i));
        setState((s) => ({ ...s, done: s.done + 1 }));
      }
      return out;
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Något gick fel." }));
      return null;
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  };
  return { ...state, run, fail: (error: string) => setState((s) => ({ ...s, error })) };
}

function Row({ item, kit, children }: { item: Item; kit: BrandKit; children?: React.ReactNode }) {
  const p = nwProduct(item.id);
  if (!p) return null;
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      {item.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.preview} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-[#F4F4F2] object-cover" />
      ) : (
        <ProductMock product={p} {...printLogos(kit, item)} zone={item.design.zone} className="h-14 w-14 shrink-0 rounded-xl" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{p.name}</span>
        <span className="block truncate text-[12.5px] text-[#6F6B63]">{designSummary(p, item.design)}</span>
      </span>
      {children}
    </li>
  );
}

const LIST = "mt-8 divide-y divide-[rgba(17,17,17,0.08)] overflow-hidden rounded-[20px] border border-[rgba(17,17,17,0.08)] bg-white";

function Done({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div role="status" className="mt-6 rounded-[20px] bg-[#F4F4F2] px-5 py-5">
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-[#6F6B63]">{text}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const progress = (s: { busy: boolean; done: number; total: number }, verb: string) => (s.busy ? `${verb} ${Math.min(s.done + 1, s.total)} av ${s.total}…` : null);

// --- Klubben -------------------------------------------------------------------------------------

/** Klubben lägger ut kollektionen i sin butik hos Intersport. Allt trycks på beställning. */
export function PublishTab({ clubId, kit, items, onStart, onSent }: { clubId: string; kit: BrandKit; items: Item[]; onStart: () => void; onSent: (ids: string[]) => void }) {
  const steps = useSteps();
  const [published, setPublished] = useState(0);
  const todo = items.filter((i) => !i.sent);

  const publish = async () => {
    const done = await steps.run(todo, async (i) => {
      const mockupUrl = await itemImage(i, kit);
      await call("/api/v1/newwave/designs", { target: { kind: "new-shop", clubId }, productId: i.id, art: kit.logo, design: i.design, color: i.color, mockupUrl });
      return i.id;
    });
    if (done) {
      onSent(done);
      setPublished(done.length);
    }
  };

  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">{kit.name}</p>
      <h2 className={H}>Butiken</h2>
      <p className={LEAD}>Kollektionen läggs ut i er butik hos Intersport. Varje köp trycks på beställning hos New Wave – inget lager och inget svinn.</p>
      {items.length ? (
        <>
          <ul className={LIST}>
            {items.map((i) => (
              <Row key={i.id} item={i} kit={kit}>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${i.sent ? "bg-[#E7F4EA] text-[#1E6B34]" : "bg-[#F2F2EF] text-[#6F6B63]"}`}>{i.sent ? "I butiken" : "Ny"}</span>
              </Row>
            ))}
          </ul>
          {published ? (
            <Done title={`${published} ${published === 1 ? "produkt" : "produkter"} ligger nu i butiken`} text="Medlemmarna kan köpa direkt. När någon beställer går ordern till New Wave, som trycker och skickar.">
              <Link href="/newwave/klubb/webshop" className={SOLID}>
                Se butiken →
              </Link>
              <Link href={`/intersport/${clubId}`} className={GHOST}>
                Så ser det ut hos Intersport
              </Link>
            </Done>
          ) : (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={publish} disabled={steps.busy || !todo.length} className={`${SOLID} disabled:opacity-50`}>
                {progress(steps, "Lägger ut") ?? (todo.length ? `Lägg ut ${todo.length} ${todo.length === 1 ? "produkt" : "produkter"} i butiken` : "Allt ligger i butiken")}
              </button>
              {steps.error ? <p className="text-[13.5px] text-[#B42318]">{steps.error}</p> : null}
            </div>
          )}
        </>
      ) : (
        <Empty onStart={onStart} />
      )}
    </div>
  );
}

// --- Craft ---------------------------------------------------------------------------------------

/** En klubb i klubbregistret som förhandsvisning: skrapat klubbmärke och profilfärger. */
const registryClub = (c: ClubItem): WorkspaceClub & { onDark?: boolean } => {
  const logo = registryAsset(c.id, c.at, "logo.png");
  return { id: c.id, name: c.name, city: c.municipality, logo, logoDark: logo, colors: c.colors?.length ? c.colors.slice(0, 4) : ["#111111"], live: false, onDark: c.onDark };
};

/** Läser tillbaka en sparad registerklubb; loggan måste peka på registrets egen fil. */
export function readRegistryClub(raw: unknown): WorkspaceClub | null {
  const r = raw as Partial<WorkspaceClub> | null;
  if (!r || typeof r.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(r.id) || typeof r.name !== "string" || typeof r.logo !== "string" || !r.logo.startsWith(`/api/v1/newwave/registry/${r.id}/logo.png`)) return null;
  const colors = Array.isArray(r.colors) ? r.colors.filter((x): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)).slice(0, 4) : [];
  return { id: r.id, name: r.name.slice(0, 120), city: typeof r.city === "string" ? r.city.slice(0, 80) : "", logo: r.logo, logoDark: r.logo, colors: colors.length ? colors : ["#111111"], live: false };
}

function ClubButton({ club, dark, active, onClick }: { club: WorkspaceClub; dark?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="flex w-full items-center gap-2 rounded-2xl bg-white p-2 text-left shadow-[inset_0_0_0_1px_var(--line)] transition aria-pressed:shadow-[inset_0_0_0_2px_var(--ink)]">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full p-1 ${dark ? "bg-[#1C1C1E]" : "bg-[#F2F2EF]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={club.logo} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
      </span>
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{club.name}</span>
    </button>
  );
}

const STEP = 40;

/** Alla klubbar i klubbregistret som har klubbmärke; listan växer medan skrapningen pågår. */
function AllClubs({ current, skip, onPick }: { current: string; skip: WorkspaceClub[]; onPick: (c: WorkspaceClub) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(STEP);
  const [page, setPage] = useState<{ total: number; items: ClubItem[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ sort: q ? "name" : "size", limit: String(limit) });
    if (q) p.set("q", q);
    fetch(`/api/v1/newwave/registry?${p}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => live && body && setPage(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [q, limit]);

  const names = new Set(skip.map((c) => c.name.toLowerCase()));
  const items = page?.items.filter((c) => !names.has(c.name.toLowerCase())) ?? [];
  return (
    <div className="mt-3">
      <label className="block">
        <span className="sr-only">Sök klubb</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLimit(STEP);
          }}
          placeholder="Sök klubb eller ort"
          className="h-10 w-full rounded-full bg-white px-4 text-[13.5px] shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--ink)]"
        />
      </label>
      <p className="mt-2 text-[12px] text-[var(--mute)]">{page ? `${new Intl.NumberFormat("sv-SE").format(page.total)} klubbar med logga och färger` : "Hämtar klubbar…"}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {items.map((c) => {
          const club = registryClub(c);
          return (
            <li key={c.id}>
              <ClubButton club={club} dark={club.onDark} active={c.id === current} onClick={() => onPick(club)} />
            </li>
          );
        })}
      </ul>
      {page && page.items.length < page.total ? (
        <button type="button" onClick={() => setLimit((l) => l + STEP)} className="mt-2 h-10 w-full rounded-2xl text-[13px] font-semibold text-[var(--mute)] shadow-[inset_0_0_0_1px_var(--line)] transition hover:text-[var(--ink)]">
          Visa fler
        </button>
      ) : null}
      {page && !page.total ? <p className="py-3 text-[13px] text-[var(--mute)]">Ingen klubb med logga matchar sökningen än.</p> : null}
    </div>
  );
}

/** Craft väljer vilken klubb studion förhandsvisar med; varje klubb får ändå sin egen logga. */
export function ClubPreview({ clubs, current, onPick }: { clubs: WorkspaceClub[]; current: WorkspaceClub; onPick: (c: WorkspaceClub) => void }) {
  const [all, setAll] = useState(false);
  const list = all || clubs.some((c) => c.id === current.id) ? clubs : [current, ...clubs];
  return (
    <div>
      <p className="drawer-label">Förhandsvisa med</p>
      <p className="mb-3 text-[13px] leading-snug text-[var(--mute)]">Ni designar en gång. Varje klubb får kollektionen med sin egen logga och sina färger.</p>
      <ul className="grid grid-cols-2 gap-2">
        {list.map((c) => (
          <li key={c.id}>
            <ClubButton club={c} active={c.id === current.id} onClick={() => onPick(c)} />
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--line)] transition hover:shadow-[inset_0_0_0_1.5px_var(--ink)]">
        {all ? "Dölj alla klubbar" : "Visa alla klubbar"}
        <span aria-hidden className={`transition ${all ? "rotate-180" : ""}`}>
          ↓
        </span>
      </button>
      {all ? <AllClubs current={current.id} skip={clubs} onPick={onPick} /> : null}
    </div>
  );
}

/** Samma kollektion på varje klubbs produkter; Craft väljer klubbar och skickar ut den som en kampanj. */
export function ClubsTab({ clubs, items, onStart, onSent }: { clubs: WorkspaceClub[]; items: Item[]; onStart: () => void; onSent: (ids: string[]) => void }) {
  const [picked, setPicked] = useState(() => new Set(clubs.map((c) => c.id)));
  const [show, setShow] = useState(items[0]?.id);
  const names = items.flatMap((i) => nwProduct(i.id)?.name.split(",")[0] ?? []);
  const [title, setTitle] = useState("Ny kollektion");
  const [brief, setBrief] = useState(() => `Kollektion från Craft: ${names.join(", ").toLowerCase()}. Samma design för alla klubbar, med klubbens egen logga och färger.`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ clubs: number; live: number } | null>(null);

  if (!items.length)
    return (
      <div className={PAGE}>
        <h2 className={H}>Klubbarna</h2>
        <Empty onStart={onStart} />
      </div>
    );

  const product = nwProduct(show ?? items[0].id) ?? (nwProduct(items[0].id) as NwProduct);
  const item = items.find((i) => i.id === product.id) ?? items[0];
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const chosen = clubs.filter((c) => picked.has(c.id));

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const list = items.slice(0, 8);
      await call("/api/v1/newwave/craft/campaigns", {
        title,
        occasion: "Kollektion",
        brief,
        products: list.map((i) => i.id),
        clubIds: chosen.map((c) => c.id),
        designs: Object.fromEntries(list.map((i) => [i.id, { design: i.design, color: i.color }])),
      });
      onSent(list.map((i) => i.id));
      setSent({ clubs: chosen.length, live: chosen.filter((c) => c.live).length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">En design · {clubs.length} klubbar</p>
      <h2 className={H}>Klubbarna</h2>
      <p className={LEAD}>Samma kollektion med varje klubbs egen logga. Välj vilka som ska få den – klubbarna godkänner själva innan något hamnar i deras butik.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Produkt i förhandsvisningen">
        {items.map((i) => {
          const p = nwProduct(i.id);
          return p ? (
            <button key={i.id} type="button" aria-pressed={i.id === product.id} onClick={() => setShow(i.id)} className="h-9 rounded-full px-3.5 text-[13px] font-medium text-[#6F6B63] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:text-[#111] aria-pressed:bg-[#111] aria-pressed:text-white aria-pressed:shadow-none">
              {p.name.split(",")[0]}
            </button>
          ) : null;
        })}
        <button type="button" onClick={() => setPicked(picked.size === clubs.length ? new Set() : new Set(clubs.map((c) => c.id)))} className="ml-auto h-9 rounded-full px-3 text-[13px] font-medium text-[#6F6B63] underline decoration-[rgba(17,17,17,0.2)] underline-offset-4 hover:text-[#111]">
          {picked.size === clubs.length ? "Avmarkera alla" : "Markera alla"}
        </button>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-4">
        {clubs.map((c) => {
          const on = picked.has(c.id);
          return (
            <li key={c.id}>
              <button type="button" onClick={() => toggle(c.id)} aria-pressed={on} className={`group block w-full overflow-hidden rounded-[20px] bg-[#F4F4F2] text-left transition ${on ? "shadow-[0_0_0_2px_#111]" : "opacity-55 hover:opacity-80"}`}>
                <ProductMock product={product} {...(wordmarkLogos(item.design, c.id) ?? { logo: c.logo, logoDark: c.logoDark })} zone={item.design.zone} className="transition duration-500 group-hover:scale-[1.03]" />
                <span className="flex items-center justify-between gap-2 bg-white px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[12px] text-[#6F6B63]">{c.live ? "I hubben · godkänner i sin dashboard" : `${c.city} · får den via mejl`}</span>
                  </span>
                  <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] ${on ? "bg-[#111] text-white" : "shadow-[inset_0_0_0_1.5px_rgba(17,17,17,0.25)]"}`}>
                    {on ? "✓" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {sent ? (
        <Done title={`Skickad till ${sent.clubs} ${sent.clubs === 1 ? "klubb" : "klubbar"}`} text={`${sent.live ? `${sent.live} av dem ser kollektionen direkt under Att godkänna i sin dashboard. ` : ""}När en klubb godkänner läggs produkterna ut i klubbens butik hos Intersport.`}>
          <Link href="/newwave/klubb/oversikt" className={SOLID}>
            Se den hos Åsa IF →
          </Link>
          <Link href="/newwave/craft/insikter" className={GHOST}>
            Följ kampanjen
          </Link>
        </Done>
      ) : (
        <div className="mt-8 grid gap-4 rounded-[22px] border border-[rgba(17,17,17,0.08)] p-5 min-[900px]:grid-cols-[1fr_1.4fr]">
          <label className={LABEL}>
            Namn på kampanjen
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={FIELD} />
          </label>
          <label className={LABEL}>
            Till klubbarna
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1200} rows={3} className={`${FIELD} h-auto py-2.5 leading-relaxed`} />
          </label>
          <div className="flex flex-wrap items-center gap-3 min-[900px]:col-span-2">
            <button type="button" onClick={send} disabled={busy || !chosen.length || title.trim().length < 2 || brief.trim().length < 10} className={`${SOLID} disabled:opacity-50`}>
              {busy ? "Skickar…" : `Skicka till ${chosen.length} ${chosen.length === 1 ? "klubb" : "klubbar"}`}
            </button>
            <p className="text-[13px] text-[#6F6B63]">
              {Math.min(items.length, 8)} {items.length === 1 ? "produkt" : "produkter"} · klubbarna godkänner själva
            </p>
            {error ? <p className="text-[13.5px] text-[#B42318]">{error}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Återförsäljaren -----------------------------------------------------------------------------

/** Återförsäljaren gör en offert på kollektionen åt sin kund och fortsätter i offertflödet. */
export function QuoteTab({ slug, markup, kit, items, onStart }: { slug: string; markup: number; kit: BrandKit; items: Item[]; onStart: () => void }) {
  const router = useRouter();
  const steps = useSteps();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [company, setCompany] = useState(kit.source.kind === "standard" || isOwnKit(kit) ? "" : kit.name);
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [needBy, setNeedBy] = useState("");

  const lineOf = (i: Item): QuoteLineInput | null => {
    const p = nwProduct(i.id);
    if (!p) return null;
    const { logo, logoDark } = printLogos(kit, i);
    return { productId: i.id, sizes: splitSizes(p, qty[i.id] ?? 50), design: i.design, color: i.color, logo: logo ?? PLACEHOLDER.light, logoDark };
  };
  const priced = items.flatMap((i) => {
    const l = lineOf(i);
    const line = l && priceLine(l, markup);
    return line ? [{ i, line }] : [];
  });
  const total = priced.reduce((s, x) => s + x.line.total, 0);
  const ready = company.trim().length >= 2 && contact.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && priced.some((x) => x.line.qty > 0);

  const create = async () => {
    const lines = await steps.run(items, async (i) => ({ ...lineOf(i)!, preview: await itemImage(i, kit) }));
    if (!lines) return;
    try {
      const { id } = await call<{ id: string }>("/api/v1/newwave/quotes", { slug, source: "studio", company: { name: company, contact, email }, needBy: needBy || undefined, lines });
      router.push(`/newwave/shop/offerter/${id}`);
    } catch (e) {
      steps.fail(e instanceof Error ? e.message : "Något gick fel.");
    }
  };

  return (
    <div className={PAGE}>
      <p className="nw-kicker text-[#6F6B63]">{kit.name}</p>
      <h2 className={H}>Offert</h2>
      <p className={LEAD}>Kollektionen som offert till kunden, med era priser. Kunden godkänner i sin kundportal och ordern går till New Wave.</p>
      {items.length ? (
        <>
          <ul className={LIST}>
            {priced.map(({ i, line }) => (
              <Row key={i.id} item={i} kit={kit}>
                <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-[#6F6B63]">
                  <span className="sr-only">Antal {line.name}</span>
                  <input type="number" inputMode="numeric" min={1} max={9999} value={qty[i.id] ?? 50} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) }))} className="h-10 w-[76px] rounded-xl border border-[rgba(17,17,17,0.14)] bg-white px-2.5 text-right text-[14px] tabular-nums outline-none focus:border-[#111]" />
                  st
                </label>
                <span className="hidden w-[96px] shrink-0 text-right text-[14px] font-semibold tabular-nums min-[600px]:block">{sek(line.total)}</span>
              </Row>
            ))}
          </ul>
          <p className="mt-3 text-right text-[14px]">
            Totalt <b className="tabular-nums">{sek(total)}</b> <span className="text-[#6F6B63]">exkl. moms</span>
          </p>

          <div className="mt-6 grid gap-4 rounded-[22px] border border-[rgba(17,17,17,0.08)] p-5 min-[700px]:grid-cols-2">
            <label className={LABEL}>
              Kundens företag
              <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} autoComplete="organization" className={FIELD} />
            </label>
            <label className={LABEL}>
              Kontaktperson
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={80} autoComplete="name" className={FIELD} />
            </label>
            <label className={LABEL}>
              E-post
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} autoComplete="email" className={FIELD} />
            </label>
            <label className={LABEL}>
              <span>
                Behövs senast <span className="font-normal text-[#6F6B63]">(valfritt)</span>
              </span>
              <input type="date" value={needBy} onChange={(e) => setNeedBy(e.target.value)} className={FIELD} />
            </label>
            <div className="flex flex-wrap items-center gap-3 min-[700px]:col-span-2">
              <button type="button" onClick={create} disabled={steps.busy || !ready} className={`${SOLID} disabled:opacity-50`}>
                {progress(steps, "Förbereder bild") ?? "Skapa offerten →"}
              </button>
              {steps.error ? <p className="text-[13.5px] text-[#B42318]">{steps.error}</p> : <p className="text-[13px] text-[#6F6B63]">Ni granskar och skickar den till kunden i nästa steg.</p>}
            </div>
          </div>
        </>
      ) : (
        <Empty onStart={onStart} />
      )}
    </div>
  );
}
