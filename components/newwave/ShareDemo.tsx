"use client";

import { useEffect, useRef, useState } from "react";

const SUBJECT = "Testa Next Wave – klubbar, Craft, New Wave och återförsäljare";
const body = (link: string) => `Hej!

Här är demon av Next Wave. Börja med filmen och välj sedan den ingång som passar dig: Klubb, Craft, New Wave eller Återförsäljare. Varje ingång har en kort guide med tre saker att prova.

${link}

Du får en egen demo, så testa fritt – inget du gör syns för någon annan.`;

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);

/**
 * Den rena länken till förstasidan, utan avsändarens demomiljö: var och en som öppnar den får en egen demo.
 * I menyn (`menu`) fälls panelen ut på plats, annars öppnas den under knappen.
 */
export function ShareDemo({ variant = "button" }: { variant?: "menu" | "button" }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- adressen finns bara i webbläsaren */
    setLink(`${window.location.origin}/newwave`);
  }, []);

  useEffect(() => {
    if (!open || variant === "menu") return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open, variant]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const panel = (
    <div className="grid gap-2">
      <p className="px-1 text-[12.5px] leading-snug text-[#6F6B63]">Var och en som öppnar länken får en egen demo. Inget du har gjort syns för dem.</p>
      <p className="truncate rounded-xl bg-[#F2F2EF] px-3 py-2 text-[12.5px] font-medium text-[#111]">{link.replace(/^https?:\/\//, "")}</p>
      <div className="flex gap-1.5">
        <button type="button" onClick={copy} className="min-h-9 flex-1 rounded-full bg-[#111] px-3 text-[13px] font-semibold text-white transition hover:opacity-90">
          {copied ? "Kopierad" : "Kopiera länken"}
        </button>
        <a href={`mailto:?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body(link))}`} className="grid min-h-9 place-items-center rounded-full px-3 text-[13px] text-[#6F6B63] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:text-[#111]">
          Mejla
        </a>
      </div>
    </div>
  );

  if (variant === "menu")
    return (
      <div>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-9 w-full items-center gap-2 rounded-full px-1 text-left text-[13px] text-[#6F6B63] transition hover:text-[#111]">
          <ShareIcon />
          Dela demon
        </button>
        {open ? <div className="pb-1 pt-1">{panel}</div> : null}
      </div>
    );

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-medium text-[#111] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.35)]">
        <ShareIcon />
        <span>Dela demon</span>
      </button>
      {open ? (
        <div className="nw-fade absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] rounded-[22px] bg-white p-3 shadow-[0_0_0_1px_rgba(17,17,17,0.06),0_24px_60px_-20px_rgba(17,17,17,0.45)]">{panel}</div>
      ) : null}
    </div>
  );
}
