"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadImage } from "@/lib/compose";
import { SCARF, checkGrid, clubScarfPalette, deltaE, indexOfNear, nearestPantone, type ScarfCheck } from "@/lib/scarf";
import { DEFAULT_ROSTER, TEMPLATES, cellsToBase64, composeScarf, renderKnit, renderPatternCanvas, type SideSpec, type Stroke, type Template } from "@/lib/scarfCompose";
import type { Club } from "@/lib/types";

type ClubListItem = { id: string; name: string; city: string; nicknames: string[] };
type Fonts = { block: string; tall: string; script: string };
type View = "knit" | "file";

const DEFAULT_CLUB = "ifk-goteborg";
const SAMPLE_PORTRAIT = "/demo/portrait.jpg";

function linesFor(t: Template, club: Club, slogan: string): Pick<SideSpec, "line1" | "line2" | "number" | "roster" | "strokes" | "crest"> {
  const up = (s: string) => s.toLocaleUpperCase("sv-SE");
  const base = { roster: DEFAULT_ROSTER, strokes: [] as Stroke[], crest: true };
  switch (t) {
    case "klassisk":
      return { ...base, line1: up(club.name), line2: `SEDAN ${club.founded}`, number: "" };
    case "smeknamn":
      return { ...base, line1: up(club.nicknames[0] ?? club.shortName), line2: up(club.city), number: "" };
    case "arena":
      return { ...base, line1: up(club.arena), line2: `${up(club.city)} · ${club.founded}`, number: "" };
    case "motiv":
      return { ...base, line1: up(slogan || club.tagline), line2: up(club.name), number: "" };
    case "personlig":
      return { ...base, line1: "ELLA", line2: up(club.name), number: "7" };
    case "trupp":
      return { ...base, line1: `${up(club.shortName)} TRUPPEN`, line2: "", number: "", crest: false };
    case "portratt":
      return { ...base, line1: "#9 HOLM", line2: up(club.name), number: "" };
    case "autograf":
      return { ...base, line1: "Alex Holm #9", line2: up(club.name), number: "" };
  }
}

/** Colours that only exist in the crest (IFK's gold) may not be used for text, stripes or background. */
function crestOnlyCheck(club: Club, palette: string[], sides: SideSpec[]): ScarfCheck {
  const crestOnly = palette
    .map((hex, i) => ({ hex, i }))
    .filter(({ hex }) => club.crestColors.some((c) => deltaE(c, hex) < 6) && !club.palette.some((c) => deltaE(c.hex, hex) < 6));
  const misused = crestOnly.filter(({ i }) => sides.some((s) => s.bg === i || s.ink === i || s.accent === i));
  if (!crestOnly.length) return { id: "crest", ok: true, title: "Klubbens färger", note: "Bara färger från klubbens profil." };
  return misused.length
    ? { id: "crest", ok: false, title: "Sköldfärg utanför skölden", note: `${misused.map((m) => nearestPantone(m.hex).code).join(", ")} får enligt klubbens regler bara finnas i skölden.` }
    : { id: "crest", ok: true, title: "Klubbens färger", note: "Sköldens egna färger används bara i skölden." };
}

export function ScarfStudio({ fonts }: { fonts: Fonts }) {
  const [clubs, setClubs] = useState<ClubListItem[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [slogan] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("slogan")?.slice(0, 60) ?? "")));
  const [crest, setCrest] = useState<HTMLImageElement | null>(null);
  const [portraitUrl, setPortraitUrl] = useState(SAMPLE_PORTRAIT);
  const [portrait, setPortrait] = useState<HTMLImageElement | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [front, setFront] = useState<SideSpec | null>(null);
  const [back, setBack] = useState<SideSpec | null>(null);
  const [font, setFont] = useState<"block" | "tall">("block");
  const [loadedFont, setLoadedFont] = useState<string | null>(null);
  const [view, setView] = useState<View>("knit");
  const [zoom, setZoom] = useState(false);
  const [result, setResult] = useState<{ cells: Uint8Array; checks: ScarfCheck[]; counts: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    fetch("/api/v1/clubs")
      .then((r) => r.json())
      .then((d: { clubs: ClubListItem[] }) => {
        setClubs(d.clubs);
        const wanted = q.get("club");
        setClubId(d.clubs.some((c) => c.id === wanted) ? wanted : (d.clubs.find((c) => c.id === DEFAULT_CLUB) ?? d.clubs[0])?.id ?? null);
      })
      .catch(() => setError("Kunde inte hämta klubbarna."));
  }, []);

  useEffect(() => {
    const family = fonts[font];
    let live = true;
    Promise.all([document.fonts.load(`400 100px ${family}`, "ÅÄÖ"), document.fonts.load(`400 100px ${fonts.script}`, "ÅÄÖ")])
      .catch(() => null)
      .then(() => live && setLoadedFont(family));
    return () => {
      live = false;
    };
  }, [font, fonts]);

  useEffect(() => {
    let live = true;
    loadImage(portraitUrl)
      .catch(() => null)
      .then((img) => live && setPortrait(img));
    return () => {
      live = false;
    };
  }, [portraitUrl]);

  useEffect(() => {
    if (!clubId) return;
    let live = true;
    (async () => {
      try {
        const d = (await fetch(`/api/v1/clubs/${clubId}`).then((r) => r.json())) as { club: Club };
        if (!live) return;
        const c = d.club;
        const pal = clubScarfPalette(c);
        const primary = indexOfNear(pal, c.palette[0]?.hex ?? pal[0]);
        const white = indexOfNear(pal, "#FFFFFF");
        const accent = pal.length > 3 ? indexOfNear(pal, c.palette[3]?.hex ?? pal[2]) : primary;
        const t: Template = slogan ? "motiv" : "klassisk";
        setClub(c);
        setPalette(pal);
        setFront({ template: t, bg: primary, ink: white, accent, ...linesFor(t, c, slogan) });
        setBack({ template: "smeknamn", bg: white, ink: primary, accent, ...linesFor("smeknamn", c, "") });
        const img = await loadImage(`/api/v1/brand/${c.id}/${c.brand.crest.farg}`).catch(() => null);
        if (live) setCrest(img);
      } catch {
        if (live) setError("Kunde inte läsa klubbens profil.");
      }
    })();
    return () => {
      live = false;
    };
  }, [clubId, slogan]);

  const fontReady = loadedFont === fonts[font];
  useEffect(() => {
    if (!front || !back || !palette.length || !fontReady) return;
    const t = setTimeout(() => {
      const { cells, minTextMm } = composeScarf({ palette, front, back, crest, portrait, font: fonts[font], scriptFont: fonts.script });
      const { checks, counts } = checkGrid(cells, palette, minTextMm);
      if (club) checks.push(crestOnlyCheck(club, palette, [front, back]));
      setResult({ cells, checks, counts });
    }, 120);
    return () => clearTimeout(t);
  }, [front, back, palette, crest, portrait, font, fonts, fontReady, club]);

  useEffect(() => {
    if (!result) return;
    if (view === "knit") {
      for (const [ref, side] of [
        [frontRef, 0],
        [backRef, 1],
      ] as const) {
        const c = ref.current;
        if (c) renderKnit(c, result.cells, palette, side, zoom ? undefined : (c.clientWidth || 1000) * Math.min(2, window.devicePixelRatio || 1));
      }
      return;
    }
    const c = fileRef.current;
    if (!c) return;
    const pat = renderPatternCanvas(result.cells, palette);
    c.width = pat.width;
    c.height = pat.height;
    c.getContext("2d")!.drawImage(pat, 0, 0);
  }, [result, view, palette, zoom]);

  const removeColor = (i: number) => {
    if (palette.length <= 2) return;
    const fix = (n: number) => (n === i ? 0 : n > i ? n - 1 : n);
    setPalette(palette.filter((_, j) => j !== i));
    setFront((s) => s && { ...s, bg: fix(s.bg), ink: fix(s.ink), accent: fix(s.accent) });
    setBack((s) => s && { ...s, bg: fix(s.bg), ink: fix(s.ink), accent: fix(s.accent) });
    setResult((r) => r && { ...r, cells: r.cells.map(fix), counts: [] });
  };

  const download = async () => {
    if (!result || !club) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/scarf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ club: club.name, palette, cells: cellsToBase64(result.cells) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Kunde inte skapa filen.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "halsduk.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa filen.");
    } finally {
      setBusy(false);
    }
  };

  const allOk = result?.checks.every((c) => c.ok) ?? false;

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">
          Klubbagenterna <span className="font-normal text-[#86868B]">Halsduk</span>
        </Link>
        {clubs.length > 1 && (
          <select
            value={clubId ?? ""}
            onChange={(e) => setClubId(e.target.value)}
            aria-label="Klubb"
            className="h-10 rounded-full bg-[#F5F5F7] px-4 text-[13px] font-medium outline-none"
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {error && <div className="mx-4 mt-2 max-w-xl rounded-2xl bg-[#FDECEA] px-5 py-3 text-sm text-[#B3261E] sm:mx-auto">{error}</div>}

      {!club || !front || !back ? (
        <div className="flex flex-1 items-center justify-center text-[15px] text-[#86868B]">Läser klubbens profil …</div>
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
          <div className="mt-8 text-center sm:mt-12">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Halsduksagenten · {club.name}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Stickad halsduk.</h1>
            <p className="mx-auto mt-3 max-w-xl text-[17px] text-[#86868B]">
              Stickas av {SCARF.factory} på {SCARF.machine}. {SCARF.needles} × {SCARF.rows} maskor, cirka {SCARF.lengthMm / 10} × {SCARF.widthMm / 10} cm, högst {SCARF.maxColors} färger.
            </p>
          </div>

          <section className="mt-10 rounded-3xl bg-[#F5F5F7] p-4 sm:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-full bg-white p-1 text-[13px] font-medium">
                {(
                  [
                    ["knit", "Så blir den"],
                    ["file", "Mönsterfil"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 transition ${view === v ? "bg-[#1D1D1F] text-white" : "text-[#424245]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {view === "knit" && (
                <button type="button" onClick={() => setZoom(!zoom)} className="text-[13px] font-medium text-[#1D1D1F] underline decoration-black/20 underline-offset-4">
                  {zoom ? "Visa hela" : "Zooma in på maskorna"}
                </button>
              )}
            </div>

            {view === "knit" ? (
              <div className="space-y-5">
                {(
                  [
                    ["Framsida", frontRef, front],
                    ["Baksida", backRef, back],
                  ] as const
                ).map(([label, ref, side]) => (
                  <figure key={label}>
                    <div className={zoom ? "overflow-x-auto rounded-xl" : ""}>
                      <div className={`flex items-stretch ${zoom ? "w-[420%]" : "w-full"}`}>
                        <Fringe color={palette[side.bg]} />
                        <canvas ref={ref} className="block h-auto min-w-0 flex-1 rounded-[3px] shadow-[0_6px_18px_rgba(0,0,0,0.12)]" style={{ aspectRatio: `${SCARF.rows * 6} / ${SCARF.side * 8}` }} />
                        <Fringe color={palette[side.bg]} />
                      </div>
                    </div>
                    <figcaption className="mt-2 text-[12px] text-[#86868B]">{label} · fransar utanför de 1 210 maskraderna</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-8">
                <canvas ref={fileRef} className="h-[70vh] max-h-[640px] w-auto rounded-md bg-white shadow-sm [image-rendering:pixelated]" style={{ aspectRatio: `${SCARF.needles} / ${SCARF.rows}` }} />
                <div className="max-w-sm text-[14px] leading-relaxed text-[#424245]">
                  <p className="font-semibold text-[#1D1D1F]">Det här får {SCARF.factory}.</p>
                  <p className="mt-2">
                    En bild på {SCARF.needles} × {SCARF.rows} pixlar där varje pixel är en maska. Vänstra halvan är framsidan, högra halvan baksidan. Teknikern läser in den i {SCARF.software}.
                  </p>
                  <p className="mt-2">Med i zip-filen: JPG i högsta kvalitet, en exakt PNG, en färglista med närmaste Pantone och en förstorad version för granskning.</p>
                </div>
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <SideEditor label="Framsida" side={front} onChange={setFront} club={club} slogan={slogan} palette={palette} hasCrest={!!crest} onPortrait={setPortraitUrl} />
            <SideEditor label="Baksida" side={back} onChange={setBack} club={club} slogan={slogan} palette={palette} hasCrest={!!crest} onPortrait={setPortraitUrl} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className="rounded-3xl border border-black/[0.08] p-5 sm:p-6">
              <h2 className="text-[17px] font-semibold">Garnfärger</h2>
              <p className="mt-1 text-[13px] text-[#86868B]">Från klubbens profil. Seger matchar garnet mot Pantone.</p>
              <ul className="mt-4 space-y-2">
                {palette.map((hex, i) => {
                  const p = nearestPantone(hex);
                  return (
                    <li key={`${hex}-${i}`} className="flex items-center gap-3">
                      <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10" style={{ background: hex }}>
                        <input
                          type="color"
                          value={hex.toLowerCase()}
                          onChange={(e) => setPalette(palette.map((h, j) => (j === i ? e.target.value.toUpperCase() : h)))}
                          className="absolute inset-0 cursor-pointer opacity-0"
                          aria-label={`Ändra färg ${i + 1}`}
                        />
                      </label>
                      <span className="min-w-0 flex-1 text-[14px]">
                        <span className="font-medium">{p.code}</span> <span className="text-[#86868B]">· {hex}</span>
                        <span className="block text-[12px] text-[#86868B]">{result ? `${result.counts[i] ?? 0} maskor` : ""}</span>
                      </span>
                      <button type="button" onClick={() => removeColor(i)} disabled={palette.length <= 2} className="h-8 rounded-full px-3 text-[13px] text-[#86868B] hover:text-[#1D1D1F] disabled:opacity-30" aria-label={`Ta bort färg ${i + 1}`}>
                        Ta bort
                      </button>
                    </li>
                  );
                })}
              </ul>
              {palette.length < SCARF.maxColors && (
                <button type="button" onClick={() => setPalette([...palette, "#808080"])} className="mt-3 text-[14px] font-medium underline decoration-black/20 underline-offset-4">
                  Lägg till färg
                </button>
              )}
              <div className="mt-5 border-t border-black/[0.06] pt-4">
                <p className="text-[13px] font-medium">Typsnitt</p>
                <div className="mt-2 flex gap-2">
                  {(
                    [
                      ["block", "Block"],
                      ["tall", "Smal"],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={font === id} onClick={() => setFont(id)} className={`h-9 rounded-full px-4 text-[14px] transition ${font === id ? "bg-[#1D1D1F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F]"}`} style={{ fontFamily: fonts[id] }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-col rounded-3xl border border-black/[0.08] p-5 sm:p-6">
              <h2 className="text-[17px] font-semibold">Kontroll före stickning</h2>
              <ul className="mt-4 space-y-3">
                {result?.checks.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${c.ok ? "bg-[#1E8E3E]" : "bg-[#B3261E]"}`}>{c.ok ? "✓" : "!"}</span>
                    <span className="text-[14px]">
                      <span className="font-medium">{c.title}</span>
                      <span className="block text-[13px] text-[#6E6E73]">{c.note}</span>
                    </span>
                  </li>
                ))}
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8E8ED] text-[11px] font-bold text-[#424245]">i</span>
                  <span className="text-[13px] text-[#6E6E73]">Halsduken stickas som en tub. Ränder runt halsduken får ett litet hack där varven möts.</span>
                </li>
              </ul>
              <div className="mt-auto pt-6">
                <button
                  type="button"
                  onClick={download}
                  disabled={!result || busy}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#1D1D1F] px-6 text-[15px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]"
                >
                  {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  Ladda ner fil till {SCARF.factory} (.zip)
                </button>
                {!allOk && result && <p className="mt-2 text-center text-[12px] text-[#B3261E]">Det finns saker att rätta – filen går ändå att ladda ner.</p>}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function Fringe({ color }: { color: string }) {
  return <div aria-hidden className="w-[3.5%] shrink-0 self-stretch" style={{ background: `repeating-linear-gradient(180deg, ${color} 0 3px, transparent 3px 6px)`, opacity: 0.9 }} />;
}

function SideEditor(props: {
  label: string;
  side: SideSpec;
  onChange: (s: SideSpec) => void;
  club: Club;
  slogan: string;
  palette: string[];
  hasCrest: boolean;
  onPortrait: (url: string) => void;
}) {
  const { side, onChange, club, palette } = props;
  const set = (patch: Partial<SideSpec>) => onChange({ ...side, ...patch });
  const roles = useMemo(
    () =>
      [
        ["bg", "Botten"],
        ["ink", "Text"],
        ["accent", "Detalj"],
      ] as const,
    [],
  );
  return (
    <section className="rounded-3xl border border-black/[0.08] p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold">{props.label}</h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={side.template === t.id}
            onClick={() => set({ template: t.id, ...linesFor(t.id, club, props.slogan) })}
            title={t.hint}
            className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition ${side.template === t.id ? "bg-[#1D1D1F] text-white" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-[#86868B]">{TEMPLATES.find((t) => t.id === side.template)?.hint}</p>

      <div className="mt-4 space-y-3">
        {side.template === "trupp" ? (
          <>
            <Field label="Rubrik" value={side.line1} max={28} onChange={(v) => set({ line1: v.toLocaleUpperCase("sv-SE") })} />
            <label className="block">
              <span className="text-[12px] text-[#86868B]">Spelare, en per rad</span>
              <textarea
                rows={4}
                value={side.roster}
                onChange={(e) => set({ roster: e.target.value.slice(0, 400) })}
                className="mt-1 w-full rounded-xl bg-[#F5F5F7] p-3 text-[14px] leading-snug outline-none focus:ring-2 focus:ring-[#1D1D1F]"
              />
            </label>
          </>
        ) : side.template === "portratt" ? (
          <>
            <div>
              <span className="text-[12px] text-[#86868B]">Foto (görs om till tre garnfärger)</span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <label className="inline-flex h-9 cursor-pointer items-center rounded-full bg-[#F5F5F7] px-4 text-[13px] font-medium hover:bg-[#E8E8ED]">
                  Byt foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f || !f.type.startsWith("image/") || f.size > 10_000_000) return;
                      const r = new FileReader();
                      r.onload = () => typeof r.result === "string" && props.onPortrait(r.result);
                      r.readAsDataURL(f);
                    }}
                  />
                </label>
                <button type="button" onClick={() => props.onPortrait(SAMPLE_PORTRAIT)} className="text-[13px] text-[#86868B] underline decoration-black/20 underline-offset-4">
                  Exempelfoto
                </button>
              </div>
            </div>
            <Field label="Namn och nummer" value={side.line1} max={28} onChange={(v) => set({ line1: v.toLocaleUpperCase("sv-SE") })} />
            <Field label="Undertext" value={side.line2} max={32} onChange={(v) => set({ line2: v.toLocaleUpperCase("sv-SE") })} />
          </>
        ) : side.template === "autograf" ? (
          <>
            <SignPad strokes={side.strokes} onChange={(strokes) => set({ strokes })} />
            {!side.strokes.length && <Field label="Eller skriv namnet som autograf" value={side.line1} max={28} onChange={(v) => set({ line1: v })} />}
            <Field label="Undertext" value={side.line2} max={32} onChange={(v) => set({ line2: v.toLocaleUpperCase("sv-SE") })} />
          </>
        ) : (
          <>
            {side.template === "personlig" && <Field label="Nummer" value={side.number} max={3} onChange={(v) => set({ number: v.replace(/[^0-9]/g, "") })} />}
            <Field label={side.template === "personlig" ? "Namn" : "Huvudtext"} value={side.line1} max={28} onChange={(v) => set({ line1: v.toLocaleUpperCase("sv-SE") })} />
            <Field label="Undertext" value={side.line2} max={32} onChange={(v) => set({ line2: v.toLocaleUpperCase("sv-SE") })} />
          </>
        )}
        {props.hasCrest && (
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={side.crest} onChange={(e) => set({ crest: e.target.checked })} className="h-4 w-4 accent-[#1D1D1F]" />
            Sköld i båda ändar
          </label>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-4">
        {roles.map(([key, label]) => (
          <div key={key}>
            <p className="text-[12px] text-[#86868B]">{label}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {palette.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  aria-label={`${label}: färg ${i + 1}`}
                  aria-pressed={side[key] === i}
                  onClick={() => set({ [key]: i } as Partial<SideSpec>)}
                  className={`h-6 w-6 rounded-full border transition ${side[key] === i ? "border-[#1D1D1F] ring-2 ring-[#1D1D1F] ring-offset-1" : "border-black/10"}`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function drawStrokes(c: HTMLCanvasElement, list: Stroke[]) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#1D1D1F";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  for (const s of list) {
    if (s.length < 2) continue;
    ctx.beginPath();
    s.forEach(([nx, ny], i) => {
      const px = nx * c.width;
      const py = ny * c.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

function SignPad({ strokes, onChange }: { strokes: Stroke[]; onChange: (s: Stroke[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useRef<Stroke | null>(null);

  useEffect(() => {
    if (ref.current) drawStrokes(ref.current, strokes);
  }, [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };

  const finish = () => {
    const cur = active.current;
    active.current = null;
    if (cur && cur.length >= 2) onChange([...strokes, cur]);
    else if (ref.current) drawStrokes(ref.current, strokes);
  };

  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-[#86868B]">
        <span>Rita autografen här</span>
        {strokes.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="underline decoration-black/20 underline-offset-4">
            Rensa
          </button>
        )}
      </div>
      <canvas
        ref={ref}
        width={480}
        height={130}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = [point(e)];
        }}
        onPointerMove={(e) => {
          if (!active.current || !ref.current) return;
          active.current.push(point(e));
          drawStrokes(ref.current, [...strokes, active.current]);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="mt-1 h-24 w-full touch-none rounded-xl border border-black/10 bg-[#F5F5F7]"
      />
    </div>
  );
}

function Field({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <label className="block">
      <span className="text-[12px] text-[#86868B]">{label}</span>
      <input value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl bg-[#F5F5F7] px-4 text-[15px] outline-none focus:ring-2 focus:ring-[#1D1D1F]" />
    </label>
  );
}
