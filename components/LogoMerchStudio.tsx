"use client";

import JSZip from "jszip";
import { type CSSProperties, useRef, useState } from "react";
import { IFKLoader, useLoader } from "@/components/IFKLoader";
import type { LogoResult } from "@/lib/logo";
import { ENGRAVABLE, LOGO_PRODUCTS, type LogoFinish, type LogoProduct, withFinish } from "@/lib/logoMerch";
import type { LogoPhoto } from "@/lib/logoPhotos";
import type { ProductLibrary } from "@/lib/merch";
import { composeMerch } from "@/lib/merchCompose";
import { dataUrlToBase64 } from "@/lib/compose";
import { downloadBlob } from "@/lib/zip";

type Step = "product" | "logo" | "result";
type Tile = { id: string; name: string; priceSek: number; url: string };

const STEPS: Step[] = ["product", "logo", "result"];
const ART_SCALE: Record<string, number> = {
  tee: 0.72,
  hoodie: 0.7,
  paraply: 0.75,
  kaffekopp: 0.8,
  emaljmugg: 0.8,
  yeti: 0.85,
  termos: 0.85,
  anteckningsbok: 0.72,
  filt: 0.7,
};
const LINES = [
  "Mäter upp tryckytan…",
  "Blandar färgerna…",
  "Riggar ljuset i studion…",
  "Stryker t-shirten…",
  "Putsar muggarna…",
  "Fäller upp paraplyet…",
  "Letar upp rätt vinkel…",
];

let libraryCache: Promise<ProductLibrary> | null = null;
const productLibrary = () => (libraryCache ??= fetch("/products/library.json").then((r) => r.json()));

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fel ${res.status}`);
  return json as T;
}

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Kunde inte läsa filen"));
    r.readAsDataURL(file);
  });

const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim() || "merch";

function PrimaryButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#1D1D1F] px-8 text-[15px] font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#D2D2D7]"
    >
      {props.loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
      {props.children}
    </button>
  );
}

function SecondaryButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="h-12 rounded-full bg-[#F5F5F7] px-6 text-[15px] font-medium hover:bg-[#E8E8ED] disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

function Check() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1D1D1F] text-white">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </span>
  );
}

function ReviewBadge({ photo }: { photo: LogoPhoto }) {
  const [open, setOpen] = useState(false);
  const r = photo.review;
  if (!r) return null;
  const ok = r.verdict === "godkänd";
  const rows: [string, number][] = [
    ["Realism", r.realism],
    ["Logga", r.logo],
    ["Placering", r.placement],
    ["Säljkraft", r.sales],
  ];
  return (
    <div className="absolute bottom-4 left-4 right-4">
      {open && (
        <div className="mb-2 rounded-2xl bg-white/92 p-4 text-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur">
          <p className="font-medium">{r.summary}</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-[#86868B]">{k}</p>
                <p className="text-[15px] font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {r.issues.length > 0 && <p className="mt-3 text-[#86868B]">{r.issues.slice(0, 2).join(" · ")}</p>}
          <p className="mt-2 text-[10px] text-[#86868B]">
            {photo.attempts === 1 ? "Godkänt på första försöket" : `Bästa av ${photo.attempts} tagningar`}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white/85 py-1 pl-1 pr-3 text-[11px] font-medium backdrop-blur"
      >
        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums text-white ${ok ? "bg-[#1D8A4E]" : "bg-[#B26A00]"}`}>
          {r.score.toFixed(1)}
        </span>
        {ok ? "Godkänd av granskaren" : "Bästa försöket"}
      </button>
    </div>
  );
}

function PhotoSlot({ photo, label }: { photo?: LogoPhoto; label: string }) {
  return (
    <figure className="relative aspect-[2/3] overflow-hidden rounded-[28px] bg-[#F5F5F7]">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-xs text-[#86868B]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#86868B] border-t-transparent" />
          Fotograferar {label.toLowerCase()}…
          <span className="text-[11px]">Granskaren betygsätter varje foto och tar om underkända.</span>
        </div>
      )}
      <figcaption className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium backdrop-blur">Foto · {label}</figcaption>
      {photo && <ReviewBadge photo={photo} />}
    </figure>
  );
}

function FinishToggle({ value, onChange, disabled }: { value: LogoFinish; onChange: (f: LogoFinish) => void; disabled?: boolean }) {
  const options: [LogoFinish, string][] = [
    ["print", "Färgtryck"],
    ["engrave", "Lasergravyr"],
  ];
  return (
    <div className="inline-flex rounded-full bg-[#F5F5F7] p-1" role="radiogroup" aria-label="Utförande för muggar och flaskor">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          disabled={disabled}
          onClick={() => onChange(id)}
          className={`h-9 rounded-full px-4 text-[13px] font-medium transition disabled:opacity-50 ${value === id ? "bg-white shadow-[0_1px_4px_rgba(0,0,0,0.1)]" : "text-[#6E6E73] hover:text-[#1D1D1F]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TileCard({ tile, large }: { tile: Tile; large?: boolean }) {
  const caption = (
    <>
      {tile.name} <span className="font-normal text-[#86868B]">· {tile.priceSek} kr</span>
    </>
  );
  return large ? (
    <figure className="relative overflow-hidden rounded-[28px] bg-[#F5F5F7]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tile.url} alt={tile.name} className="aspect-[2/3] w-full object-cover mix-blend-multiply" />
      <figcaption className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium backdrop-blur">Mockup · {tile.name}</figcaption>
    </figure>
  ) : (
    <figure>
      <div className="overflow-hidden rounded-[28px] bg-[#F5F5F7]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tile.url} alt={tile.name} className="aspect-square w-full object-contain mix-blend-multiply" />
      </div>
      <figcaption className="mt-2.5 px-1 text-[13px] font-medium">{caption}</figcaption>
    </figure>
  );
}

export function LogoMerchStudio() {
  const [step, setStep] = useState<Step>("product");
  const [productId, setProductId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [logo, setLogo] = useState<LogoResult | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [photos, setPhotos] = useState<LogoPhoto[] | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState<LogoFinish>("print");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const loader = useLoader();

  const product = LOGO_PRODUCTS.find((p) => p.id === productId);
  const color = logo?.color ?? "#1D1D1F";
  const theme = {
    "--brand": color,
    "--accent": color,
    "--stripe-a": color,
    "--stripe-b": "#FFFFFF",
    "--bar-a": color,
    "--bar-b": color,
    "--bar-bg": "#F0F0F2",
  } as CSSProperties;

  const fetchLogo = async (body: { url: string } | { dataUrl: string; name: string }) => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      setLogo(await post<LogoResult>("/api/v1/logo", body));
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogoBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) return setLogoError("Filen är för stor (max 5 MB).");
    const dataUrl = await readFile(file);
    await fetchLogo({ dataUrl, name: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\blogo(type)?\b/i, "").trim() || "Ditt företag" });
  };

  const shoot = (p: LogoProduct, l: LogoResult, f: LogoFinish, id: number) => {
    setPhotos(null);
    setPhotoError(null);
    post<{ photos: LogoPhoto[] }>("/api/v1/logo-photos", { productId: p.id, logo: { light: l.light, dark: l.dark }, finish: f })
      .then((r) => {
        if (runId.current !== id) return;
        setPhotos(r.photos);
        if (r.photos.length === 0) setPhotoError("Fotona kunde inte tas just nu.");
      })
      .catch((e: Error) => {
        if (runId.current !== id) return;
        setPhotos([]);
        setPhotoError(e.message);
      });
  };

  const compose = async (p: LogoProduct, l: LogoResult, f: LogoFinish) => {
    const library = await productLibrary();
    const ordered = [p, ...LOGO_PRODUCTS.filter((x) => x.id !== p.id)].filter((x) => library[x.id]);
    return Promise.all(
      ordered.map(async (x) => {
        const item = withFinish(x, f);
        return {
          id: item.id,
          name: item.finish === "engrave" ? `${item.name}, graverad` : item.name,
          priceSek: item.priceSek,
          url: await composeMerch({
            product: item,
            entry: library[item.id],
            blankUrl: `/products/${item.id}.jpg`,
            artUrl: item.variant === "dark" ? l.dark : l.light,
            artScale: item.art === "crest" ? 1 : Math.min(1, (ART_SCALE[item.id] ?? 0.62) * (l.width / l.height > 3.5 ? 1.25 : 1)),
          }),
        };
      }),
    );
  };

  const generate = async () => {
    if (!logo || !product) return;
    const id = ++runId.current;
    setBusy(true);
    setError(null);
    loader.start(`Lägger loggan på ${LOGO_PRODUCTS.length} produkter`, 90, 6000);
    shoot(product, logo, finish, id);
    try {
      const made = await compose(product, logo, finish);
      if (runId.current !== id) return;
      setTiles(made);
      setStep("result");
      loader.done();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeFinish = async (f: LogoFinish) => {
    if (f === finish) return;
    setFinish(f);
    if (!logo || !product || step !== "result") return;
    const id = ++runId.current;
    if (ENGRAVABLE.includes(product.id)) shoot(product, logo, f, id);
    else runId.current = id;
    try {
      const made = await compose(product, logo, f);
      if (runId.current === id) setTiles(made);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadZip = async () => {
    if (!logo) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(`${safe(logo.name)} – merch`)!;
      const mock = root.folder("Mockups")!;
      tiles.forEach((t, i) => mock.file(`${String(i + 1).padStart(2, "0")} ${t.name.toLowerCase()}.jpg`, dataUrlToBase64(t.url), { base64: true }));
      const photoDir = root.folder("Foton")!;
      for (const p of photos ?? []) photoDir.file(`${product?.name.toLowerCase()} – ${p.label.toLowerCase()}.jpg`, new Uint8Array(await (await fetch(p.url)).arrayBuffer()));
      const logoDir = root.folder("Logga")!;
      logoDir.file("logga-ljusa-produkter.png", new Uint8Array(await (await fetch(logo.light)).arrayBuffer()));
      logoDir.file("logga-morka-produkter.png", new Uint8Array(await (await fetch(logo.dark)).arrayBuffer()));
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${safe(logo.name)}-merch.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const hero = tiles.find((t) => t.id === productId);
  const rest = tiles.filter((t) => t.id !== productId);

  return (
    <main className="flex min-h-screen flex-col bg-white" style={theme}>
      <header className="flex h-16 items-center justify-between px-8">
        <button type="button" onClick={() => setStep("product")} className="w-64 text-left text-[15px] font-semibold tracking-tight">
          Merch <span className="font-normal text-[#86868B]">med din logga</span>
        </button>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all ${i <= stepIndex ? "w-6 bg-[#1D1D1F]" : "w-1.5 bg-[#D2D2D7]"}`} />
          ))}
        </div>
        <div className="w-64" />
      </header>

      {error && <div className="mx-auto mt-2 max-w-xl rounded-2xl bg-[#FDECEA] px-5 py-3 text-sm text-[#B3261E]">{error}</div>}

      <div className="flex flex-1 flex-col items-center px-6 pb-24">
        {step === "product" && (
          <div className="mt-[6vh] w-full max-w-6xl">
            <h1 className="text-center text-5xl font-semibold tracking-tight">Välj produkt.</h1>
            <p className="mt-3 text-center text-[17px] text-[#86868B]">Vi fotograferar den med din logga – och trycker loggan på hela kollektionen.</p>
            <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              {LOGO_PRODUCTS.map((p) => {
                const on = productId === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setProductId(p.id)} className="group text-left">
                    <div
                      className={`relative aspect-square overflow-hidden rounded-[28px] bg-[#F5F5F7] transition ${on ? "ring-2 ring-[#1D1D1F] ring-offset-4" : "group-hover:bg-[#EFEFF2]"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/products/${p.id}.jpg`}
                        alt={p.name}
                        className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply transition duration-500 group-hover:scale-[1.04]"
                      />
                      {on && (
                        <span className="absolute right-4 top-4">
                          <Check />
                        </span>
                      )}
                    </div>
                    <p className="mt-3 px-1 text-[15px] font-medium">{p.name}</p>
                    <p className="px-1 text-xs text-[#86868B]">
                      {p.blurb} · {p.priceSek} kr
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="sticky bottom-6 mx-auto mt-12 flex w-fit rounded-full bg-white/85 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
              <PrimaryButton onClick={() => setStep("logo")} disabled={!productId}>
                Nästa
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "logo" && product && (
          <div className="mt-[10vh] w-full max-w-xl text-center">
            <button type="button" onClick={() => setStep("product")} className="mx-auto flex items-center gap-3 rounded-full bg-[#F5F5F7] py-1.5 pl-1.5 pr-4 text-sm hover:bg-[#E8E8ED]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/products/${product.id}.jpg`} alt="" className="h-8 w-8 rounded-full bg-white object-contain mix-blend-multiply" />
              {product.name} <span className="text-[#86868B]">· Byt</span>
            </button>
            <h1 className="mt-8 text-5xl font-semibold tracking-tight">Din logga.</h1>
            <p className="mt-3 text-[17px] text-[#86868B]">Klistra in adressen till er webbplats. Vi hämtar loggan därifrån.</p>
            <div className="mt-10 flex gap-2">
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && !logoBusy && fetchLogo({ url })}
                placeholder="t.ex. www.företaget.se"
                className="h-14 flex-1 rounded-2xl bg-[#F5F5F7] px-5 text-[17px] outline-none ring-[#1D1D1F] placeholder:text-[#86868B] focus:ring-2"
              />
              <button
                type="button"
                onClick={() => fetchLogo({ url })}
                disabled={!url.trim() || logoBusy}
                className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[#F5F5F7] px-6 text-[15px] font-medium hover:bg-[#E8E8ED] disabled:opacity-50"
              >
                {logoBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1D1D1F] border-t-transparent" />}
                {logoBusy ? "Hämtar…" : "Hämta logga"}
              </button>
            </div>
            <p className="mt-3 text-sm text-[#86868B]">
              Eller{" "}
              <button type="button" onClick={() => fileInput.current?.click()} className="font-medium text-[#1D1D1F] underline underline-offset-2">
                ladda upp loggan
              </button>{" "}
              som PNG, JPG eller SVG.
            </p>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {logoError && <p className="mt-4 text-sm text-[#B3261E]">{logoError}</p>}

            {logo && (
              <div className="mt-8 rounded-[28px] border border-[#E8E8ED] p-5 text-left">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex h-36 items-center justify-center rounded-2xl bg-white ring-1 ring-[#E8E8ED]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.light} alt={logo.name} className="max-h-24 max-w-[80%] object-contain" />
                  </div>
                  <div className="flex h-36 items-center justify-center rounded-2xl bg-[#1D1D1F]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.dark} alt={`${logo.name} på mörkt`} className="max-h-24 max-w-[80%] object-contain" />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{logo.name}</p>
                    <p className="truncate text-xs text-[#86868B]">Hittad: {logo.source}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-[#86868B]">
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ background: logo.color }} />
                    {logo.color}
                  </span>
                </div>
              </div>
            )}

            {ENGRAVABLE.includes(product.id) && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <FinishToggle value={finish} onChange={changeFinish} />
                <p className="text-xs text-[#86868B]">
                  {finish === "engrave" ? "Loggan graveras i materialet, ton i ton." : "Loggan trycks i sina egna färger."}
                </p>
              </div>
            )}

            <div className="mt-10">
              <PrimaryButton onClick={generate} disabled={!logo || logoBusy} loading={busy}>
                Skapa merch
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "result" && product && logo && (
          <div className="mt-[5vh] w-full max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-24 items-center justify-center rounded-2xl bg-[#F5F5F7]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.light} alt="" className="max-h-10 max-w-[76px] object-contain" />
                </div>
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight">
                    {logo.name} <span className="text-[#86868B]">×</span> {product.name.toLowerCase()}
                  </h1>
                  <p className="mt-1 text-[15px] text-[#86868B]">
                    {tiles.length} produkter med exakt tryck · {photos === null ? "fotona tas just nu" : `${photos.length} foton`}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <SecondaryButton onClick={() => setStep("product")}>Byt produkt</SecondaryButton>
                <SecondaryButton onClick={() => setStep("logo")}>Byt logga</SecondaryButton>
                <PrimaryButton onClick={downloadZip} disabled={photos === null} loading={busy}>
                  Ladda ner allt (.zip)
                </PrimaryButton>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <PhotoSlot photo={photos?.find((p) => p.id === "livsstil")} label="Livsstil" />
              <PhotoSlot photo={photos?.find((p) => p.id === "produkt")} label="Produkt" />
              {hero && <TileCard tile={hero} large />}
            </div>
            {photoError && <p className="mt-3 text-center text-xs text-[#B3261E]">{photoError}</p>}

            <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">Hela kollektionen</h2>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-[#86868B]">Kopp, yeti-mugg och termos</span>
                <FinishToggle value={finish} onChange={changeFinish} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
              {rest.map((t) => (
                <TileCard key={t.id} tile={t} />
              ))}
            </div>
          </div>
        )}
      </div>

      <IFKLoader state={loader.state} crestUrl={logo?.light ?? "/favicon.ico"} lines={LINES} doneLine="Klart!" wide />
    </main>
  );
}
