"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadZip } from "@/components/ScarfParts";
import { LogoMark } from "@/components/newwave/Logo";
import { SCARF } from "@/lib/scarf";
import type { HeroLogo } from "./ScarfHero3D";

const Scarf3D = dynamic(() => import("./ScarfHero3D"), { ssr: false });

/** Garnfärger att prova halsduken i. Den första är modellens egen. */
const YARNS = [
  { name: "Vit", hex: "#FFFFFF" },
  { name: "Svart", hex: "#1B1C1F" },
  { name: "Blå", hex: "#234B9A" },
  { name: "Röd", hex: "#C8202B" },
  { name: "Grön", hex: "#157A45" },
  { name: "Gul", hex: "#F2C417" },
];

const DEFAULT_LOGO = "/newwave/logo-mark.svg";

/**
 * Gör en uppladdad logga redo att läggas på halsduken: skalas ner, och en enfärgad bakgrund (JPG utan
 * genomskinlighet) tas bort. Ger också loggans ljushet, så att halsduken kan byta färg om loggan annars försvinner.
 */
function prepareLogo(src: string): Promise<HeroLogo & { light: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const [iw, ih] = [img.naturalWidth || 512, img.naturalHeight || 512];
      const k = Math.min(1, max / Math.max(iw, ih)) * (Math.max(iw, ih) < 400 ? 400 / Math.max(iw, ih) : 1);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(iw * k));
      c.height = Math.max(1, Math.round(ih * k));
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const im = ctx.getImageData(0, 0, c.width, c.height);
      const d = im.data;
      const at = (x: number, y: number) => (y * c.width + x) * 4;
      const corners = [at(0, 0), at(c.width - 1, 0), at(0, c.height - 1), at(c.width - 1, c.height - 1)];
      const bg = corners[0];
      const same = (o: number, tol: number) => Math.abs(d[o] - d[bg]) + Math.abs(d[o + 1] - d[bg + 1]) + Math.abs(d[o + 2] - d[bg + 2]) <= tol;
      if (corners.every((o) => d[o + 3] > 250 && same(o, 24))) {
        const [r, g, b] = [d[bg], d[bg + 1], d[bg + 2]];
        for (let o = 0; o < d.length; o += 4) {
          const diff = Math.abs(d[o] - r) + Math.abs(d[o + 1] - g) + Math.abs(d[o + 2] - b);
          // Mjuk kant: nära bakgrundsfärgen tonas pixeln ut i stället för att klippas.
          if (diff < 90) d[o + 3] = Math.round((Math.max(0, diff - 30) / 60) * 255);
        }
        ctx.putImageData(im, 0, 0);
      }
      let [sum, n] = [0, 0];
      for (let o = 0; o < d.length; o += 16) {
        if (d[o + 3] < 128) continue;
        sum += d[o] * 0.299 + d[o + 1] * 0.587 + d[o + 2] * 0.114;
        n++;
      }
      resolve({ canvas: c, aspect: c.width / c.height, light: n ? sum / n : 128 });
    };
    img.onerror = () => reject(new Error("Kunde inte läsa bilden – prova PNG, SVG eller JPG."));
    img.src = src;
  });
}

const dark = (hex: string) => parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 < 110;
/** En ljus logga försvinner på ljust garn och en mörk på mörkt; då får halsduken svart eller vitt garn i stället. */
const fit = (hex: string, light: number) => (light > 185 && !dark(hex) ? YARNS[1].hex : light < 70 && dark(hex) ? YARNS[0].hex : hex);

type Props = {
  /** Filväljaren delas med klubbväljaren längre ner, så att en logga laddas upp på ett enda ställe. */
  fileRef: React.RefObject<HTMLInputElement | null>;
  /** En klubb som besökaren har valt: märket läggs på halsduken, i klubbens färg. */
  mark: { url: string; color?: string } | null;
  /** Namnet på stickordern när halsduken laddas ner. */
  name?: string;
  /** En egen logga har laddats upp, frilagd och klar att sparas. */
  onLogo: (dataUrl: string) => void;
  /** Besökaren vill att agenten gör fler halsdukar med den egna loggan. */
  onUse: () => void;
  /** Antalet sparade designer i webbläsaren, bredvid länken i sidhuvudet. */
  saved?: number;
};

export function ScarfHero({ fileRef, mark, name, onLogo, onUse, saved = 0 }: Props) {
  const [logo, setLogo] = useState<(HeroLogo & { light: number }) | null>(null);
  const [source, setSource] = useState<"standard" | "egen" | "klubb">("standard");
  /** Färgen besökaren själv har valt. Utan val får halsduken klubbens färg, eller vitt. */
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // En ny klubb börjar om från klubbens egen färg.
  const [seen, setSeen] = useState(mark?.url);
  if (seen !== mark?.url) {
    setSeen(mark?.url);
    setPicked(null);
  }

  useEffect(() => {
    let live = true;
    prepareLogo(DEFAULT_LOGO)
      .then((l) => live && setLogo((prev) => prev ?? l))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  const markUrl = mark?.url;
  useEffect(() => {
    if (!markUrl) return;
    let live = true;
    prepareLogo(markUrl)
      .then((l) => {
        if (!live) return;
        setLogo(l);
        setSource("klubb");
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [markUrl]);

  const club = source === "klubb" && mark?.color ? mark.color.toUpperCase() : null;
  const color = picked ?? (club && logo ? fit(club, logo.light) : YARNS[0].hex);
  const yarns = club && !YARNS.some((y) => y.hex === club) ? [{ name: "Klubbens färg", hex: club }, ...YARNS] : YARNS;
  const own = source === "egen";
  const made = source !== "standard";

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Välj en bildfil – PNG, SVG eller JPG.");
    if (file.size > 12_000_000) return setError("Bilden är för stor – välj en under 12 MB.");
    const url = URL.createObjectURL(file);
    try {
      const l = await prepareLogo(url);
      setLogo(l);
      setSource("egen");
      if (fit(color, l.light) !== color) setPicked(fit(color, l.light));
      onLogo(l.canvas.toDataURL("image/png"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte läsa bilden.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  /** Stickfilerna för just den här halsduken: garnfärgen och loggan på båda ändarna. */
  const download = async () => {
    if (!logo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await downloadZip({ hero: { color, logo: logo.canvas.toDataURL("image/png"), name } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa stickfilerna.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden bg-[#0B0B0D] text-white">
      {/* Ett mjukt ljus bakom halsduken, så att den lyfter från den mörka bottnen. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_62%_70%_at_72%_52%,rgba(255,255,255,0.13),rgba(255,255,255,0.03)_55%,transparent_75%)] max-lg:bg-[radial-gradient(ellipse_90%_45%_at_50%_70%,rgba(255,255,255,0.12),transparent_70%)]" />

      <header className="relative z-10 flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5 text-[15px] font-semibold tracking-tight" aria-label="Next Wave – till ingångarna">
          <LogoMark size={28} />
          <span>
            <span className="hidden text-[13px] tracking-[0.18em] sm:inline">NEXT WAVE </span>
            <span className="font-normal text-white/55">Halsduksagenten</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/halsduk/sparade" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-medium text-white hover:bg-white/20 sm:px-4">
            <span>
              Sparade<span className="hidden sm:inline"> designer</span>
            </span>
            {saved > 0 && <span className="text-white/55">{saved}</span>}
          </Link>
          <Link href="/halsduk/inspiration" className="inline-flex h-10 items-center rounded-full bg-white/10 px-3 text-[13px] font-medium text-white hover:bg-white/20 sm:px-4">
            Inspiration<span className="hidden sm:inline">sbank</span>
          </Link>
        </nav>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-2 px-4 pb-20 pt-6 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-6 lg:pb-16 lg:pt-0">
        <div className="min-w-0 max-lg:text-center">
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-white/50">
            Stickas av {SCARF.factory} på {SCARF.machine}
          </p>
          <h1 className="mt-3 text-[clamp(40px,min(6.2vw,9.5vh),76px)] font-semibold leading-[0.98] tracking-[-0.035em]">
            Från signal
            <br />
            till stickfil.
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/65 max-lg:mx-auto">Agenten föreslår tre halsdukar. Du väljer en och får stickfilerna, och inlägg, banner, film och affisch till den.</p>

          <div className="mt-6 flex flex-wrap items-center gap-3 max-lg:justify-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-medium transition ${made ? "border border-white/30 text-white hover:border-white/70" : "bg-white text-[#0B0B0D] hover:bg-white/90"}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
              </svg>
              {own ? "Byt logga" : "Ladda upp din logga"}
            </button>
            <div className="flex items-center gap-1.5" role="group" aria-label="Garnfärg">
              {yarns.map((y) => (
                <button
                  key={y.hex}
                  type="button"
                  aria-label={y.name}
                  aria-pressed={color === y.hex}
                  title={y.name}
                  onClick={() => setPicked(y.hex)}
                  className={`h-8 w-8 rounded-full border transition ${color === y.hex ? "border-white shadow-[0_0_0_2px_#0B0B0D,0_0_0_3.5px_#fff]" : "border-white/25 hover:border-white/60"}`}
                  style={{ background: y.hex }}
                />
              ))}
            </div>
          </div>

          {/* När halsduken bär en logga går den att hämta som stickfil, precis som den ser ut. */}
          {made && (
            <div className="mt-3 flex flex-wrap items-center gap-3 max-lg:justify-center">
              <button type="button" onClick={download} disabled={busy || !logo} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-[#0B0B0D] transition hover:bg-white/90 disabled:opacity-60">
                <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
                </svg>
                {busy ? "Stickar och packar …" : "Stickfiler (.zip)"}
              </button>
              {own && (
                <button type="button" onClick={onUse} className="inline-flex h-12 items-center rounded-full px-2 text-[14px] font-medium text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white/70">
                  Fler förslag från agenten
                </button>
              )}
            </div>
          )}
          {error ? (
            <p className="mt-3 text-[13px] text-[#FF9A8F]">{error}</p>
          ) : (
            <p className="mt-3 text-[12.5px] text-white/40">{made ? "Stickfilerna gäller halsduken du ser: färgen och loggan på båda ändarna." : "Loggan hamnar på båda ändarna – prova med din egen."}</p>
          )}
        </div>

        {/* På bred skärm tar halsduken den höjd som finns kvar, så att startpanelen under syns även i ett lågt fönster. */}
        <div className={`relative h-[400px] w-full min-w-0 overflow-hidden transition-opacity duration-700 sm:h-[500px] lg:h-[clamp(360px,calc(100vh-330px),540px)] ${ready ? "opacity-100" : "opacity-0"}`}>
          <Scarf3D color={color} logo={logo} onReady={() => setReady(true)} />
        </div>
        {!ready && <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-[12.5px] text-white/35 lg:left-1/2 lg:bottom-1/2">Halsduken läggs upp …</p>}
      </div>
    </section>
  );
}
