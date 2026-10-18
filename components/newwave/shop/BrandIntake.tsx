"use client";

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type Occasion, occasion as occasionOf, type OccasionId } from "@/lib/newwave/occasions";
import { genitive, hostOf, useBrandedScene, validHost } from "./brandAgent";
import { BrandConfirm, type BrandSource } from "./BrandConfirm";
import { type CustomerLogo, useCart } from "./cart";

const LOGO_TYPES = "image/png,image/jpeg,image/svg+xml,image/webp";

/**
 * Kundens väg in: webbadressen eller loggan går till varumärkesagenten, kunden bekräftar och loggan sparas för hela
 * butiken. `hero` är startsidans stora intag, `bar` raden på eventsidan.
 */
export function BrandIntake({ slug, variant, cta, preview, onDone, onPlan }: { slug: string; variant: "hero" | "bar"; cta: string; preview?: boolean; onDone?: (logo: CustomerLogo) => void; onPlan?: () => void }) {
  const [cart, update] = useCart(slug);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState<BrandSource | null>(null);
  const [changing, setChanging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const submit = () => {
    const host = hostOf(url);
    if (!validHost(host)) return setError("Skriv en webbadress, till exempel volvo.com");
    setError("");
    setSource({ url: host });
  };
  const pickFile = (f: File | undefined) => {
    setDragging(false);
    if (!f) return;
    if (!LOGO_TYPES.split(",").includes(f.type)) return setError("Använd PNG, JPG, SVG eller WebP.");
    setError("");
    setSource({ file: f });
  };
  const done = (logo: CustomerLogo) => {
    update((c) => ({ ...c, logo }));
    setSource(null);
    setChanging(false);
    setUrl("");
    onDone?.(logo);
  };

  const confirm = (
    <AnimatePresence>{source ? <BrandConfirm key="confirm" source={source} cta={cta} onDone={done} onClose={() => setSource(null)} /> : null}</AnimatePresence>
  );
  const fileInput = <input ref={file} type="file" accept={LOGO_TYPES} className="sr-only" aria-label="Välj er logga" onChange={(e) => (pickFile(e.target.files?.[0]), (e.target.value = ""))} />;

  if (cart.logo && !changing && !preview) {
    if (variant === "bar")
      return (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="flex h-12 items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-[inset_0_0_0_1px_var(--shop-line)]">
            <span className="grid h-9 w-14 place-items-center rounded-full bg-[#F4F4F2] px-2">
              <img src={cart.logo.light} alt="" className="max-h-6 max-w-full object-contain" />
            </span>
            <span className="text-[14px] font-semibold">{cart.logo.name}</span>
          </span>
          <button type="button" onClick={() => setChanging(true)} className="text-[13.5px] font-medium underline underline-offset-4 opacity-70 hover:opacity-100">
            Byt logga
          </button>
          {confirm}
        </div>
      );
    return <Welcome logo={cart.logo} slug={slug} count={cart.lines.length} onPlan={onPlan} onChange={() => setChanging(true)} />;
  }

  if (variant === "bar")
    return (
      <div className="mt-6">
        <form
          className="flex h-14 max-w-[520px] items-center rounded-full bg-[#F4F4F2] p-1.5 pl-5 focus-within:ring-2 focus-within:ring-[var(--shop)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input value={url} onChange={(e) => (setUrl(e.target.value), setError(""))} placeholder="dittforetag.se" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Er webbadress" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none focus-visible:outline-none! placeholder:text-[#9A968D]" />
          <button type="submit" className="h-11 shrink-0 rounded-full bg-[var(--shop)] px-5 text-[14.5px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.02]">
            Skapa med min logga
          </button>
        </form>
        <p className="mt-2 text-[13px] opacity-60">
          {error ? (
            <span className="text-[#B42318] opacity-100">{error}</span>
          ) : (
            <>
              Ingen webbplats?{" "}
              <button type="button" onClick={() => file.current?.click()} className="font-medium underline underline-offset-4">
                Ladda upp loggan
              </button>
              {changing ? (
                <>
                  {" · "}
                  <button type="button" onClick={() => setChanging(false)} className="font-medium underline underline-offset-4">
                    Behåll {cart.logo?.name}
                  </button>
                </>
              ) : null}
            </>
          )}
        </p>
        {fileInput}
        {confirm}
      </div>
    );

  return (
    <div
      className="mt-7"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files[0]);
      }}
    >
      <form
        className="flex h-[62px] items-center rounded-full bg-white p-2 pl-6 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35),inset_0_0_0_1px_var(--shop-line)] focus-within:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35),inset_0_0_0_2px_var(--shop)]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={url} onChange={(e) => (setUrl(e.target.value), setError(""))} placeholder="dittforetag.se" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Er webbadress" className="min-w-0 flex-1 bg-transparent text-[17px] outline-none focus-visible:outline-none! placeholder:text-[#9A968D]" />
        <button type="submit" className="h-[46px] shrink-0 rounded-full bg-[var(--shop)] px-6 text-[15px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.02] active:scale-[0.98]">
          Starta
        </button>
      </form>
      {error ? <p className="mt-2 pl-6 text-[13.5px] text-[#B42318]">{error}</p> : null}
      <div className="my-3 flex items-center gap-3 text-[12.5px] opacity-50">
        <span className="h-px flex-1 bg-current opacity-30" />
        eller
        <span className="h-px flex-1 bg-current opacity-30" />
      </div>
      <button type="button" onClick={() => file.current?.click()} className={`flex w-full items-center gap-4 rounded-[22px] border border-dashed px-5 py-4 text-left transition ${dragging ? "border-[var(--shop)] bg-[var(--shop-bg)]" : "border-[#D6D4CC] hover:border-[var(--shop)]"}`}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 shrink-0 fill-none stroke-current opacity-70" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h8l4 4v14H6zM14 3v4h4M12 10v7M9 13l3-3 3 3" />
        </svg>
        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold">{dragging ? "Släpp loggan här" : "Ladda upp er logga"}</span>
          <span className="block text-[12.5px] opacity-60">PNG, JPG eller SVG – vi frilägger den och gör en ljus och en mörk version</span>
        </span>
      </button>
      {changing ? (
        <button type="button" onClick={() => setChanging(false)} className="mt-3 text-[13px] font-medium underline underline-offset-4 opacity-70">
          Behåll {cart.logo?.name}
        </button>
      ) : null}
      {fileInput}
      {confirm}
    </div>
  );
}

/** Startsidans hälsning när loggan redan finns: fortsätt planera, varukorgen eller byt företag. */
function Welcome({ logo, slug, count, onPlan, onChange }: { logo: CustomerLogo; slug: string; count: number; onPlan?: () => void; onChange: () => void }) {
  return (
    <div className="mt-7 rounded-[24px] bg-white p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.35),inset_0_0_0_1px_var(--shop-line)] @2xl:p-5">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-20 shrink-0 place-items-center rounded-2xl bg-[#F4F4F2] p-2.5">
          <img src={logo.light} alt="" className="max-h-full max-w-full object-contain" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold tracking-tight">Välkommen tillbaka, {logo.name}</p>
          <p className="text-[13.5px] opacity-60">{count ? `${count} ${count === 1 ? "produkt" : "produkter"} i varukorgen` : "Er logga ligger redo på alla produkter"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onPlan ? (
          <button type="button" onClick={onPlan} className="inline-flex h-11 items-center rounded-full bg-[var(--shop)] px-5 text-[14.5px] font-semibold text-[var(--shop-on)] transition-transform hover:scale-[1.02]">
            Välj tillfälle
          </button>
        ) : null}
        {count ? (
          <Link href={`/newwave/s/${slug}/offert`} className="inline-flex h-11 items-center rounded-full px-4 text-[14px] font-semibold shadow-[inset_0_0_0_1px_var(--shop-line)] hover:shadow-[inset_0_0_0_1px_var(--shop)]">
            Varukorgen ({count})
          </Link>
        ) : null}
        <button type="button" onClick={onChange} className="ml-auto text-[13px] font-medium underline underline-offset-4 opacity-60 hover:opacity-100">
          Byt företag
        </button>
      </div>
    </div>
  );
}

function PickerCard({ o, href, logo }: { o: Occasion; href: string; logo: CustomerLogo | null }) {
  const branded = useBrandedScene(o.id, logo);
  return (
    <Link href={href} className="group block min-w-0">
      <span className="relative block aspect-[3/2] overflow-hidden rounded-2xl bg-[#F4F4F2]">
        <img src={branded ?? o.scene} alt="" className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]" />
        {branded ? <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">Med er logga</span> : null}
      </span>
      <span className="mt-2 block text-[14.5px] font-semibold">{o.name}</span>
      <span className="block truncate text-[12.5px] opacity-60">{o.hint}</span>
    </Link>
  );
}

/** "Vad ska Volvo planera?" – tillfällena med scenerna, efter att loggan bekräftats. */
export function EventPicker({ slug, offered, onClose }: { slug: string; offered: OccasionId[]; onClose: () => void }) {
  const [cart] = useCart(slug);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[860px] rounded-[28px] bg-white p-6 text-[#1D1D1F] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)] sm:p-9"
      >
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[#F4F4F2] text-[18px] transition hover:bg-[#EAEAE6]">
          ×
        </button>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--shop)] opacity-80">Nästa steg</p>
        <h2 id="picker-title" className="mt-2 pr-10 text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
          Vad ska {cart.logo?.name || "ni"} planera?
        </h2>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed opacity-65">Välj tillfälle så bygger agenterna miljön med {cart.logo ? `${genitive(cart.logo.name)} logga` : "er logga"} och tar fram produkterna som passar er.</p>
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
          {offered.map((id) => (
            <PickerCard key={id} o={occasionOf(id)!} href={`/newwave/s/${slug}/event/${id}`} logo={cart.logo} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
