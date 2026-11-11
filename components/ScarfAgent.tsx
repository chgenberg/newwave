"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import { EditDialog, type ScarfEditResult } from "@/components/ScarfEdit";
import { ScarfHero } from "@/components/ScarfHero";
import { ChooseDialog, MaterialView } from "@/components/ScarfMaterial";
import { Badge, FactoryDialog, LEVEL, Pictures, QUIET, ScarfActions, downloadZip, type ScarfInfo } from "@/components/ScarfParts";
import { ClubPicker, OwnLogoDialog, type PickLite } from "@/components/ScarfPick";
import { SCARF } from "@/lib/scarf";
import type { ScarfReview } from "@/lib/scarfAgent";
import { saveDesign, savedCount } from "@/lib/scarfSaved";
import type { FilmChannel, ImageChannel, ScarfCopy, ScarfMaterial } from "@/lib/scarfChannels";
import type { ScarfPick } from "@/lib/scarfClub";
import type { SignStroke } from "@/lib/scarfDesign";
import type { ProductionReport } from "@/lib/scarfProduction";
import type { Level, ScarfIdea } from "@/lib/scarfRecipes";
import { BRAND_WISHES, WISHES, WISH_MAX, type WishId } from "@/lib/scarfWishes";
import type { Signal, SourceStatus } from "@/lib/types";

type IdeaView = ScarfIdea & { level: Level; recipeLabel: string };
type Profile = { id: string; name: string; kind: string; agent: string; crest: string; yarns: { hex: string; pantone: string; name: string }[]; rules: string[] };
type Knit = { palette: string[]; report: ProductionReport; images: { front: string; back: string }; text: { front: string; back: string }; consent: string | null; artFile: string | null; artNote: string | null };
/** Det som hör till en halsduk utöver idén: det ritade motivet, och beställarens eget foto och egna namnteckningar. */
type Files = { artFile?: string | null; photoFile?: string | null; signFile?: string | null };
type ItemState = "kö" | "stickar" | "granskas" | "görs om" | "klar" | "fel";
type Item = { key: string; idea: IdeaView; state: ItemState; files: Files; strokes: SignStroke[]; knit?: Knit; review?: ScarfReview | null; first?: { title: string; review: ScarfReview }; edited?: boolean; error?: string };
/** Materialet för det valda motivet. `base` är halsduken det gjordes för, så att zip-filen packas för just den. */
type Made = { key: string; title: string; base: { clubId: string; idea: ScarfIdea } & Files; copy: ScarfCopy; material: ScarfMaterial; notes: string[] };
type Film = { film: { url: string; poster: string } | null; note: string | null };

/** Klubben sidan öppnar med. Resten av profilen hämtas från servern. */
const START: ScarfPick = { ref: "ifk-goteborg", name: "IFK Göteborg", sub: "Göteborg", crest: "/api/v1/brand/ifk-goteborg/skold-farg.png", colors: ["#234B9A", "#FFFFFF", "#1A3770"], brand: false, lines: [], done: "Heja Blåvitt!" };
/** Agenten tar alltid fram tre förslag. Ett av dem väljs, och får material för alla kanaler. */
const COUNT = 3;
const CONTENT = "/api/v1/scarf/agent/content";

const STEPS = [
  { n: 1, title: "Klubben", text: "Sköld, garnfärger och regelbok läses in." },
  { n: 2, title: "Signaler", text: "Kalender, matcher, väder och klubbens egna symboler." },
  { n: 3, title: "Idéer", text: "Agenten föreslår halsdukar och väljer recept, text och färger." },
  { n: 4, title: "Stickning", text: `Varje idé blir ${SCARF.needles} × ${SCARF.rows.toLocaleString("sv-SE")} maskor.` },
  { n: 5, title: "Maskinkontroll", text: `Garner, varv, textstorlek och lösa maskor för ${SCARF.machine}.` },
  { n: 6, title: "Granskare", text: "En andra agent sätter betyg. Underkänt görs om en gång." },
  { n: 7, title: "Stickfiler", text: `Mönster, stickorder och garnlista till ${SCARF.factory}.` },
  { n: 8, title: "Material", text: "Inlägg, banner och film för det valda motivet." },
];

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}

const strip = (i: IdeaView): ScarfIdea => ({ id: i.id, title: i.title, why: i.why, signal: i.signal, recipe: i.recipe, front: i.front, back: i.back, font: i.font, colors: i.colors, icon: i.icon, art: i.art, number: i.number, roster: i.roster });

const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114;
/** Startknappens färg: klubbens bärande färg, om den syns mot vitt. */
const actionColor = (colors: string[]) => colors.find((c) => lum(c) < 215) ?? "#1D1D1F";

const machineLine = (r: { yarns: number; max: number; minText: number | null }) => `${r.yarns} garner, högst ${r.max} per varv${r.max <= 4 ? " – dubbelsystem möjligt" : ""}${r.minText !== null ? `, minsta text ${r.minText} mm` : ""}.`;

const stoppedBy = (i: Item) => Boolean((i.knit && !i.knit.report.ok) || i.review?.verdict === "underkänd");

/** Allt om en stickad halsduk som kortet, popuprutan och den sparade designen visar. */
function infoOf(item: Item, club: string): ScarfInfo | null {
  const { idea, knit, review } = item;
  if (!knit) return null;
  return {
    eyebrow: `${club} · ${idea.recipeLabel} · ${LEVEL[idea.level].toLocaleLowerCase("sv-SE")}`,
    title: idea.title,
    why: idea.why,
    signal: idea.signal,
    images: knit.images,
    text: knit.text,
    yarns: knit.report.yarns.map((y) => ({ hex: y.hex, pantone: y.pantone, share: y.share })),
    machine: { ok: knit.report.ok, summary: machineLine({ yarns: knit.report.yarns.length, max: knit.report.maxColorsPerRow, minText: null }), checks: knit.report.checks },
    review: review ?? null,
    first: item.first,
    consent: knit.consent,
    note: knit.artNote,
  };
}

export function ScarfAgent() {
  const [pick, setPick] = useState<ScarfPick>(START);
  /** Klubben den senaste körningen gjordes för – korten hör till den, även om en annan klubb väljs efteråt. */
  const [ran, setRan] = useState<ScarfPick>(START);
  const [featured, setFeatured] = useState<PickLite[]>([]);
  const [picker, setPicker] = useState(false);
  /** Klubben vars märke ligger på halsduken i heron. */
  const [heroMark, setHeroMark] = useState<PickLite | null>(null);
  /** Den uppladdade loggan, och klubben den blev när den fick ett namn. */
  const [ownLogo, setOwnLogo] = useState<string | null>(null);
  const [ownPick, setOwnPick] = useState<ScarfPick | null>(null);
  const [naming, setNaming] = useState(false);
  const [wishes, setWishes] = useState<WishId[]>([]);
  const [wish, setWish] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [mode, setMode] = useState<"ai" | "demo" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [factory, setFactory] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  /** Popuprutan med de tre förslagen, det valda motivet och materialet som gjordes för det. */
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [making, setMaking] = useState(false);
  const [madeError, setMadeError] = useState<string | null>(null);
  const loader = useLoader();
  const results = useRef<HTMLElement>(null);
  const materialRef = useRef<HTMLDivElement>(null);
  /** Sparade designer: varje körnings tidpunkt, vad som redan är sparat och hur många som ligger i webbläsaren. */
  const stamps = useRef(new Map<number, number>());
  const kept = useRef(new Map<string, string>());
  const [savedN, setSavedN] = useState(0);
  const start = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Loggan laddas upp från klubbväljaren: då ska den få ett namn direkt. */
  const nameNext = useRef(false);
  const live = useRef(0);

  // Hela profilen för den valda klubben: färgerna styr startknappen och laddningsrutan.
  useEffect(() => {
    let on = true;
    fetch(`/api/v1/scarf/agent/club?ref=${encodeURIComponent(pick.ref)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((full: ScarfPick | null) => on && full && setPick((p) => (p.ref === full.ref ? full : p)))
      .catch(() => null);
    return () => {
      on = false;
    };
  }, [pick.ref]);

  useEffect(() => {
    fetch("/api/v1/clubs?hub=1")
      .then((r) => r.json())
      .then((d: { clubs: { id: string; name: string; city: string }[] }) => setFeatured(d.clubs.map((c) => ({ ref: c.id, name: c.name, sub: c.city, crest: `/api/v1/brand/${c.id}/skold-farg.png` }))))
      .catch(() => null);
  }, []);

  useEffect(() => {
    void savedCount().then(setSavedN);
  }, []);

  // Varje färdig halsduk sparas i webbläsaren, och sparas om när den ändras eller får sitt material.
  useEffect(() => {
    if (!profile || !items.length) return;
    // Körningen får sin tidpunkt när den första halsduken sparas; den håller ihop körningens förslag i listan.
    const runAt = stamps.current.get(live.current) ?? Date.now();
    stamps.current.set(live.current, runAt);
    const jobs: Promise<void>[] = [];
    items.forEach((it, order) => {
      const info = it.state === "klar" ? infoOf(it, profile.name) : null;
      if (!info) return;
      const mine = made?.key === it.key ? made : null;
      const id = `${runAt}:${it.key}`;
      const sign = [it.idea.id, it.edited ? 1 : 0, it.review?.verdict ?? "", info.images.front.length, mine ? Object.values(mine.material.images).join() : ""].join("|");
      if (kept.current.get(id) === sign) return;
      kept.current.set(id, sign);
      jobs.push(
        saveDesign({
          id,
          runAt,
          savedAt: Date.now(),
          order,
          club: { ref: ran.ref, name: profile.name, crest: profile.crest, brand: profile.kind === "brand" },
          title: it.idea.title,
          recipeLabel: it.idea.recipeLabel,
          level: it.idea.level,
          download: { clubId: ran.ref, idea: strip(it.idea), ...it.files },
          info,
          stopped: stoppedBy(it),
          made: mine ? { copy: mine.copy, material: mine.material, notes: mine.notes } : null,
        }),
      );
    });
    if (jobs.length) void Promise.all(jobs).then(savedCount).then(setSavedN);
  }, [items, made, profile, ran.ref]);

  const choose = (p: PickLite) => {
    setPicker(false);
    setPick(ownPick?.ref === p.ref ? ownPick : { ...p, colors: [], brand: false, lines: [], done: "Klart!" });
    setHeroMark(p);
    setWishes([]);
  };

  const patch = (key: string, next: Partial<Item>) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...next } : it)));

  const allowed = WISHES.filter((w) => !pick.brand || BRAND_WISHES.includes(w.id));
  const want = allowed.filter((w) => wishes.includes(w.id)).map((w) => w.id);

  const run = async () => {
    if (running) return;
    const id = ++live.current;
    const alive = () => live.current === id;
    const clubId = pick.ref;
    setRunning(true);
    setRan(pick);
    setError(null);
    setItems([]);
    setSignals([]);
    setProfile(null);
    setMode(null);
    setNote(null);
    setEditing(null);
    setChoosing(false);
    setChosen(null);
    setMade(null);
    setMadeError(null);
    setStep(1);
    loader.start(pick.brand ? "Läser loggan, garnerna och regelboken" : "Läser klubbens sköld, garner och regelbok", 6, 2500);
    try {
      const s: { ai: boolean; club: Profile; signals: Signal[]; sources: SourceStatus[] } = await fetch(`/api/v1/scarf/agent/signals?clubId=${encodeURIComponent(clubId)}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Kunde inte läsa klubbens profil.");
        return r.json();
      });
      if (!alive()) return;
      setProfile(s.club);
      setStep(2);
      setSignals(s.signals);
      setSources(s.sources);

      setStep(3);
      loader.stage(`${s.signals.length} signaler hittade – agenten tar fram tre förslag`, 34, 40000);
      const { mode: m, ideas, note: why, signals: used } = await post<{ mode: "ai" | "demo"; note: string | null; signals?: Signal[]; ideas: IdeaView[] }>("/api/v1/scarf/agent/ideas", { clubId, signals: s.signals, count: COUNT, want, wish: wish.trim() || undefined });
      if (!alive()) return;
      setMode(m);
      setNote(why);
      // Beställarens egen önskan kommer tillbaka som en signal bland de andra.
      if (used) setSignals(used);
      setItems(ideas.map((idea) => ({ key: idea.id, idea, state: "kö", files: {}, strokes: [] })));
      setStep(4);

      const queue = [...ideas];
      // Rutan fylls från 34 till 98 procent i takt med att halsdukarna blir klara.
      let finished = 0;
      const n = Math.max(1, ideas.length);
      const say = (label: string) => alive() && loader.stage(label, 34 + (64 * Math.min(n, finished + 1)) / n - 1, 25000);
      const worker = async () => {
        for (let first = queue.shift(); first; first = queue.shift()) {
          const key = first.id;
          try {
            let idea = first;
            patch(key, { state: "stickar" });
            say(idea.art ? `Bildmodellen ritar motivet till ”${idea.title}”` : `Stickar ”${idea.title}” – ${SCARF.needles} × ${SCARF.rows.toLocaleString("sv-SE")} maskor`);
            let knit = await post<Knit>("/api/v1/scarf/agent/knit", { clubId, idea: strip(idea) });
            if (!alive()) return;
            patch(key, { knit, files: { artFile: knit.artFile }, state: m === "ai" ? "granskas" : "klar" });
            if (m !== "ai") continue;
            say(`Granskaren ser på ”${idea.title}”`);
            let { review } = await post<{ review: ScarfReview | null }>("/api/v1/scarf/agent/review", { clubId, idea: strip(idea), artFile: knit.artFile });
            if (!alive()) return;
            if (review?.verdict === "underkänd") {
              patch(key, { review, state: "görs om" });
              say(`Underkänd – agenten gör om ”${idea.title}”`);
              const { ideas: revised } = await post<{ ideas: IdeaView[] }>("/api/v1/scarf/agent/ideas", { clubId, revise: { idea: strip(idea), review: { summary: review.summary, issues: review.issues } } });
              if (revised[0]) {
                const earlier = { title: idea.title, review };
                idea = revised[0];
                patch(key, { idea, state: "stickar", first: earlier });
                knit = await post<Knit>("/api/v1/scarf/agent/knit", { clubId, idea: strip(idea) });
                if (!alive()) return;
                patch(key, { knit, files: { artFile: knit.artFile }, state: "granskas" });
                say(`Granskaren ser på den nya ”${idea.title}”`);
                review = (await post<{ review: ScarfReview | null }>("/api/v1/scarf/agent/review", { clubId, idea: strip(idea), artFile: knit.artFile })).review;
              }
            }
            if (alive()) patch(key, { review, state: "klar" });
          } catch (e) {
            if (alive()) patch(key, { state: "fel", error: e instanceof Error ? e.message : "Något gick fel." });
          } finally {
            finished++;
            if (alive()) loader.set(34 + (64 * finished) / n);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (alive()) {
        setStep(7);
        loader.done();
        // När laddningsrutan har tonat bort kommer förslagen upp, och ett av dem väljs.
        setTimeout(() => {
          if (!alive()) return;
          results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setChoosing(true);
        }, 750);
      }
    } catch (e) {
      if (alive()) {
        loader.fail();
        setError(e instanceof Error ? e.message : "Något gick fel.");
      }
    } finally {
      if (alive()) setRunning(false);
    }
  };

  /** Ett motiv är valt: agenten skriver texterna, halsduken fotograferas, och bilderna och filmerna görs för varje kanal. */
  const make = async (item: Item) => {
    if (making || running || !item.knit) return;
    const id = live.current;
    const alive = () => live.current === id;
    const base = { clubId: ran.ref, idea: strip(item.idea), ...item.files };
    const signal = signals.find((s) => s.title === item.idea.signal);
    setChoosing(false);
    setChosen(item.key);
    setMade(null);
    setMadeError(null);
    setMaking(true);
    loader.start("Agenten skriver texterna för varje kanal", 24, 22000);
    try {
      // Fotografierna tar längst tid och börjar därför samtidigt som texterna. Utan dem görs materialet av halsduken ensam.
      const shooting = post<{ photos: string[]; note: string | null }>(CONTENT, { step: "photo", ...base }).catch(() => ({ photos: [] as string[], note: "Fotografierna gick inte att ta, så materialet är gjort utan." }));
      const { copy } = await post<{ copy: ScarfCopy }>(CONTENT, { step: "copy", ...base, signal: signal && { title: signal.title, detail: signal.detail } });
      if (!alive()) return;
      loader.stage("Halsduken fotograferas på modell", 68, 60000);
      const shot = await shooting;
      if (!alive()) return;
      loader.stage("Bilderna sätts och filmerna klipps", 97, 30000);
      const rest = { ...base, copy, photos: shot.photos };
      const film = (channel: FilmChannel) => post<Film>(CONTENT, { step: "film", channel, ...rest }).catch((): Film => ({ film: null, note: null }));
      const [images, reels, tiktok] = await Promise.all([post<{ images: Record<ImageChannel, string> }>(CONTENT, { step: "images", ...rest }), film("reels"), film("tiktok")]);
      if (!alive()) return;
      const notes = [shot.photos.length ? "Personerna på bilderna finns inte – fotografierna är gjorda av bildmodellen." : shot.note, reels.film && tiktok.film ? null : "En film gick inte att klippa den här gången."].filter((n): n is string => Boolean(n));
      setMade({ key: item.key, title: item.idea.title, base, copy, material: { images: images.images, films: { reels: reels.film, tiktok: tiktok.film }, photos: shot.photos.map((f) => `/api/v1/files/${f}`) }, notes });
      loader.done();
      setTimeout(() => materialRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 750);
    } catch (e) {
      if (alive()) {
        loader.fail();
        setMadeError(e instanceof Error ? e.message : "Kunde inte skapa materialet.");
      }
    } finally {
      if (alive()) setMaking(false);
    }
  };

  /** Beställaren har ändrat en färdig halsduk: den stickas om, och granskaren ser på den igen. Går något fel står den gamla kvar. */
  const rework = async (before: Item, edit: ScarfEditResult<IdeaView>) => {
    const id = live.current;
    const alive = () => live.current === id;
    const clubId = ran.ref;
    const { key } = before;
    let idea = edit.idea;
    let files: Files = { artFile: before.files.artFile, photoFile: edit.photoFile, signFile: edit.signFile };
    setEditing(null);
    patch(key, { state: edit.instruction ? "görs om" : "stickar", error: undefined });
    try {
      if (edit.instruction) {
        const { ideas } = await post<{ ideas: IdeaView[] }>("/api/v1/scarf/agent/ideas", { clubId, change: { idea: strip(idea), instruction: edit.instruction } });
        if (!ideas[0]) throw new Error("Agenten kunde inte göra ändringen. Prova att skriva den på ett annat sätt.");
        // Ett nytt motiv ritas bara om agenten har ändrat beskrivningen av det.
        if (ideas[0].art !== idea.art) files = { ...files, artFile: null };
        idea = ideas[0];
        if (!alive()) return;
        patch(key, { state: "stickar" });
      }
      const knit = await post<Knit>("/api/v1/scarf/agent/knit", { clubId, idea: strip(idea), ...files });
      if (!alive()) return;
      files = { ...files, artFile: knit.artFile };
      patch(key, { idea, knit, files, strokes: edit.strokes, edited: true, review: undefined, state: mode === "ai" ? "granskas" : "klar" });
      // Materialet gjordes för den gamla halsduken och får göras om.
      setMade((m) => (m?.key === key ? null : m));
      if (mode !== "ai") return;
      const review = await post<{ review: ScarfReview | null }>("/api/v1/scarf/agent/review", { clubId, idea: strip(idea), ...files })
        .then((r) => r.review)
        .catch(() => null);
      if (alive()) patch(key, { review, state: "klar" });
    } catch (e) {
      if (alive()) patch(key, { ...before, error: e instanceof Error ? e.message : "Kunde inte ändra halsduken." });
    }
  };

  const done = items.filter((i) => i.state === "klar");
  const approved = done.filter((i) => !stoppedBy(i));
  const current = step >= 4 && step < 7 ? (items.some((i) => i.state === "granskas" || i.state === "görs om") ? 6 : items.some((i) => i.knit) ? 5 : 4) : step;
  const usedSignals = signals.filter((s) => items.some((i) => i.idea.signal === s.title));
  const [c0, c1] = [pick.colors[0] ?? "#234B9A", pick.colors[1] ?? "#FFFFFF"];
  const second = c1.toUpperCase() === "#FFFFFF" ? (pick.colors[2] ?? c0) : c1;
  // Laddningsrutan i klubbens färger.
  const theme = { "--brand": c0, "--accent": second, "--stripe-a": c0, "--stripe-b": c1, "--bar-a": second, "--bar-b": c0, "--bar-bg": "#ECECEF" } as React.CSSProperties;
  const action = actionColor(pick.colors);
  const edited = editing ? items.find((i) => i.key === editing) : undefined;
  const proposals = items.filter((i) => i.knit && (i.state === "klar" || i.state === "granskas"));
  const picked = chosen ? items.find((i) => i.key === chosen) : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-white" style={theme}>
      <ScarfHero
        fileRef={fileRef}
        mark={heroMark ? { url: heroMark.crest, color: heroMark.ref === pick.ref && !pick.ref.startsWith("own:") ? pick.colors[0] : undefined } : null}
        name={heroMark ? heroMark.name : ownPick?.name}
        saved={savedN}
        onLogo={(dataUrl) => {
          setOwnLogo(dataUrl);
          setOwnPick(null);
          setHeroMark(null);
          if (nameNext.current) setNaming(true);
          nameNext.current = false;
        }}
        onUse={() => (ownPick ? (setPick(ownPick), start.current?.scrollIntoView({ behavior: "smooth", block: "center" })) : setNaming(true))}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        {/* Startpanelen: klubben och en enda tydlig knapp på samma rad, önskemålen under. Den ligger halvvägs upp på heron, så att den syns direkt. */}
        <section ref={start} aria-label="Skapa halsdukar" className="relative z-10 mx-auto -mt-12 max-w-[960px] scroll-mt-6 rounded-[28px] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06] sm:p-5">
          <div className="grid gap-x-3 gap-y-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="order-1 min-w-0">
              <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Klubb</p>
              <button type="button" onClick={() => setPicker(true)} disabled={running} className="flex h-16 w-full items-center gap-3 rounded-2xl border border-black/[0.12] px-3 text-left transition hover:border-black/40 disabled:opacity-50">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pick.crest} alt="" className="max-h-11 max-w-11 object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16.5px] font-semibold tracking-tight">{pick.name}</span>
                  {pick.sub && <span className="block truncate text-[12.5px] text-[#86868B]">{pick.sub}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[13.5px] font-medium text-[#424245]">
                  Byt
                  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
            </div>
            {/* På mobilen kommer knappen sist, efter önskemålen. */}
            <button type="button" onClick={run} disabled={running || making} className="order-3 inline-flex h-16 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl px-7 text-[18px] font-semibold tracking-tight shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:brightness-110 active:scale-[0.995] disabled:opacity-60 md:order-2 md:w-auto" style={{ background: action, color: lum(action) > 160 ? "#1D1D1F" : "#FFFFFF" }}>
              {running ? "Agenten arbetar …" : items.length ? "Skapa tre nya förslag" : "Skapa tre förslag"}
              {!running && (
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>

            <div className="order-2 min-w-0 md:order-3 md:col-span-2">
              <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">
                Önskemål <span className="font-normal normal-case tracking-normal">· valfritt, högst tre</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {allowed.map((w) => {
                  const on = wishes.includes(w.id);
                  return (
                    <button key={w.id} type="button" aria-pressed={on} disabled={running || (!on && want.length >= COUNT)} onClick={() => setWishes((prev) => (on ? prev.filter((x) => x !== w.id) : [...prev, w.id]))} className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition disabled:opacity-50 ${on ? "border-[#1D1D1F] bg-[#1D1D1F] text-white" : "border-black/[0.12] text-[#1D1D1F] hover:border-black/40"}`}>
                      {on && (
                        <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                      {w.label}
                    </button>
                  );
                })}
                <input value={wish} maxLength={WISH_MAX} disabled={running} onChange={(e) => setWish(e.target.value)} placeholder="Egen önskan, t.ex. Derby mot AIK" aria-label="Egen önskan" className="h-10 w-full min-w-0 rounded-full border border-black/[0.12] px-4 text-[14px] outline-none placeholder:text-[#86868B] focus:border-[#1D1D1F] disabled:opacity-50 md:w-auto md:min-w-[260px] md:flex-1" />
              </div>
            </div>
          </div>
          {error && <p className="mt-4 rounded-2xl bg-[#FDECEA] px-5 py-3 text-center text-sm text-[#B3261E]">{error}</p>}
        </section>
        <p className="mt-3 text-center text-[12.5px] text-[#86868B]">Agenten tar fram tre förslag. Du väljer ett och får inlägg, banner och film till det.</p>
        {step === 0 && (
          <p className="mt-5 text-center">
            <Link href="/halsduk/inspiration" className="text-[14px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
              Se halsdukar i inspirationsbanken
            </Link>
          </p>
        )}

        {step > 0 && (
          <ol className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Flödets steg">
            {STEPS.map((s) => {
              const state = s.n === 8 ? (made ? "klar" : making ? "nu" : "väntar") : step === 7 || s.n < current ? "klar" : s.n === current && running ? "nu" : "väntar";
              return (
                <li key={s.n} title={s.text} className={`flex items-center gap-1.5 text-[12.5px] font-medium ${state === "väntar" ? "text-[#A1A1A6]" : "text-[#1D1D1F]"}`}>
                  <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold ${state === "klar" ? "bg-[#1E8E3E] text-white" : state === "nu" ? "bg-[#1D1D1F] text-white" : "bg-[#E8E8ED] text-[#86868B]"}`}>{state === "klar" ? "✓" : s.n}</span>
                  {s.title}
                </li>
              );
            })}
          </ol>
        )}

        {profile && (
          <section ref={results} className="mt-10 scroll-mt-6">
            {/* Överblick: klubben till vänster, körningens utfall till höger. */}
            <div className="grid gap-4 rounded-3xl bg-[#F5F5F7] p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.crest} alt="" className="h-14 max-w-24 shrink-0 object-contain" />
                <div className="min-w-0">
                  <p className="text-[19px] font-semibold tracking-tight">{profile.name}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {profile.yarns.map((y) => (
                      <li key={y.hex} className="flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 text-[11.5px]" title={y.name}>
                        <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: y.hex }} />
                        <span className="font-medium">{y.pantone.replace("PANTONE ", "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <dl className="grid grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["Signaler", signals.length || "–"],
                    ["Idéer", items.length || "–"],
                    ["Godkända", items.length ? approved.length : "–"],
                    ["Omgjorda", items.length ? items.filter((i) => i.first).length : "–"],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white px-4 py-2.5">
                    <dd className="text-[24px] font-semibold leading-none tracking-tight">{value}</dd>
                    <dt className="mt-1 text-[11px] text-[#86868B]">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            {signals.length > 0 && (
              <details className="group mt-3 rounded-3xl border border-black/[0.08] px-5 py-4 sm:px-6">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13.5px] [&::-webkit-details-marker]:hidden">
                  <span className="font-semibold">Signaler som blev halsdukar</span>
                  {usedSignals.length ? (
                    usedSignals.map((s) => (
                      <span key={s.id} className="rounded-full bg-[#1D1D1F] px-2.5 py-1 text-[11.5px] font-medium text-white">
                        {s.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#86868B]">väljs av agenten …</span>
                  )}
                  <span className="ml-auto text-[12.5px] text-[#86868B] underline decoration-black/20 underline-offset-4 group-open:hidden">Visa alla {signals.length}</span>
                  <span className="ml-auto hidden text-[12.5px] text-[#86868B] underline decoration-black/20 underline-offset-4 group-open:inline">Dölj</span>
                </summary>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {signals.map((s) => {
                    const used = usedSignals.includes(s);
                    return (
                      <li key={s.id} className={`rounded-2xl px-3.5 py-2.5 text-[13px] ${used ? "bg-[#F5F5F7] shadow-[inset_0_0_0_1.5px_#1D1D1F]" : "bg-[#F5F5F7]"}`}>
                        <span className="font-semibold">{s.title}</span>
                        {s.daysUntil !== undefined && <span className="text-[#86868B]"> · om {s.daysUntil} dagar</span>}
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6E6E73]">{s.detail}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[12px] text-[#86868B]">Källor: {sources.map((s) => `${s.name}${s.ok ? "" : " (svarade inte)"}`).join(", ")}.</p>
              </details>
            )}

            {/* Det valda motivets material, eller vägen dit. */}
            <div ref={materialRef} className="scroll-mt-6">
              {made && !making ? (
                <div className="mt-10">
                  <MaterialView title={made.title} copy={made.copy} material={made.material} notes={made.notes} onChange={() => setChoosing(true)} onZip={() => downloadZip({ ...made.base, copy: made.copy, material: made.material }, `${CONTENT}/zip`, "material.zip")} />
                </div>
              ) : (
                step === 7 &&
                !making &&
                proposals.length > 0 && (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#F5F5F7] px-5 py-4 sm:px-6">
                    <p className="text-[14.5px] text-[#424245]">{madeError ?? (picked ? `”${picked.idea.title}” har ändrats. Skapa materialet igen, eller välj ett annat motiv.` : "Välj ett av förslagen, så får du inlägg, banner och film till det.")}</p>
                    <div className="flex flex-wrap gap-2">
                      {picked?.knit && picked.state === "klar" && (
                        <button type="button" onClick={() => void make(picked)} className="inline-flex h-10 items-center justify-center rounded-full bg-[#1D1D1F] px-4 text-[13.5px] font-medium text-white transition hover:bg-black">
                          {madeError ? "Försök igen" : "Skapa materialet"}
                        </button>
                      )}
                      <button type="button" onClick={() => setChoosing(true)} className={picked ? QUIET : "inline-flex h-10 items-center justify-center rounded-full bg-[#1D1D1F] px-4 text-[13.5px] font-medium text-white transition hover:bg-black"}>
                        {picked ? "Byt motiv" : "Välj motiv"}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {step >= 3 && (
              <div className="mt-10">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{items.length ? (running ? `${done.length} av ${items.length} halsdukar klara` : `${approved.length} av ${items.length} halsdukar klara för stickeriet`) : "Agenten tar fram idéer …"}</h2>
                  {mode === "demo" && note && <p className="max-w-sm text-[12.5px] text-[#86868B]">{note}</p>}
                </div>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  {items.map((it) => (
                    <ScarfCard key={it.key} item={it} clubId={ran.ref} club={profile.name} crest={profile.crest} everyday={profile.kind === "brand"} chosen={it.key === chosen} onEdit={() => setEditing(it.key)} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mt-12 text-center">
          <button type="button" onClick={() => setFactory(true)} className="text-[13.5px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4 hover:decoration-black/60">
            Vad får stickeriet?
          </button>
        </div>
      </div>

      {factory && <FactoryDialog onClose={() => setFactory(false)} />}
      {choosing && !running && !making && profile && (
        <ChooseDialog
          club={profile.name}
          chosen={chosen}
          proposals={proposals.map((i) => ({ key: i.key, title: i.idea.title, label: i.idea.recipeLabel, why: i.idea.why, front: i.knit!.images.front, back: i.knit!.images.back, stopped: i.state !== "klar" || stoppedBy(i) }))}
          onPick={(key) => {
            const item = items.find((i) => i.key === key);
            if (item) void make(item);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {picker && (
        <ClubPicker
          current={pick.ref}
          featured={featured}
          own={ownPick}
          onPick={choose}
          onUpload={() => {
            setPicker(false);
            nameNext.current = true;
            fileRef.current?.click();
          }}
          onClose={() => setPicker(false)}
        />
      )}
      {naming && ownLogo && (
        <OwnLogoDialog
          logo={ownLogo}
          onDone={(p) => {
            setNaming(false);
            setOwnPick(p);
            setPick(p);
            setWishes([]);
            start.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onClose={() => setNaming(false)}
        />
      )}
      {edited?.knit && <EditDialog key={edited.key} title={edited.idea.title} idea={edited.idea} photoFile={edited.files.photoFile ?? null} strokes={edited.strokes} canAsk={mode === "ai"} onSave={(next) => void rework(edited, next)} onClose={() => setEditing(null)} />}

      <IFKLoader state={loader.state} crestUrl={pick.crest} lines={pick.lines.length ? pick.lines : undefined} doneLine={pick.done} wide={pick.brand} />
    </main>
  );
}

function ScarfCard({ item, clubId, club, crest, everyday, chosen, onEdit }: { item: Item; clubId: string; club: string; crest: string; everyday: boolean; chosen: boolean; onEdit: () => void }) {
  const { idea, knit } = item;
  const working = item.state === "stickar" || item.state === "granskas" || item.state === "görs om";
  const stopped = item.state === "klar" && stoppedBy(item);
  const info = infoOf(item, club);
  return (
    <article className={`flex flex-col rounded-3xl border p-5 ${chosen ? "border-[#1D1D1F]" : "border-black/[0.08]"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen && <Badge dark>Vald</Badge>}
        <Badge dark={!chosen}>{LEVEL[idea.level]}</Badge>
        <Badge>{idea.recipeLabel}</Badge>
        {knit?.artFile && <Badge>Ritat motiv</Badge>}
        {item.first && <Badge>Omgjord</Badge>}
        {item.edited && <Badge>Ändrad</Badge>}
        <span
          className={`ml-auto inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium ${
            item.state === "fel" || stopped ? "bg-[#FDECEA] text-[#B3261E]" : item.state === "klar" ? "bg-[#E6F4EA] text-[#1E8E3E]" : "bg-[#F5F5F7] text-[#424245]"
          }`}
        >
          {working && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1D1D1F]" />}
          {item.state === "kö" ? "Väntar" : item.state === "stickar" ? "Stickas" : item.state === "granskas" ? "Hos granskaren" : item.state === "görs om" ? "Görs om" : item.state === "fel" ? "Fel" : stopped ? "Stoppad" : "Klar för stickeriet"}
        </span>
      </div>
      <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{idea.title}</h3>

      {item.error && <p className="mt-3 rounded-2xl bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#B3261E]">{item.error}</p>}
      {!knit && !item.error && <div className="mt-3 flex h-36 items-center justify-center rounded-2xl bg-[#F5F5F7] text-[13px] text-[#86868B]">{item.state === "kö" ? "Väntar på sin tur" : "Maskorna läggs …"}</div>}

      {knit && info && (
        <>
          <div className={`mt-3 rounded-2xl bg-[#F5F5F7] p-3 transition-opacity ${working ? "opacity-50" : ""}`}>
            <Pictures front={knit.images.front} back={knit.images.back} text={knit.text} />
          </div>
          {stopped && <p className="mt-2.5 text-[12.5px] leading-snug text-[#B3261E]">Stoppad av {knit.report.ok ? "granskaren" : "maskinkontrollen"} – se Mer information.</p>}
          <div className="mt-auto pt-4">
            <ScarfActions info={info} download={{ clubId, idea: strip(idea), ...item.files }} photo={{ club, headline: idea.front.main || idea.back.main, crestUrl: crest, everyday }} ready={item.state === "klar"} onEdit={onEdit} />
          </div>
        </>
      )}
    </article>
  );
}
