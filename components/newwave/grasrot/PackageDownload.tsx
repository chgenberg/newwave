"use client";

import { useState } from "react";

/** Paketet byggs på upp till en halv minut första gången; knappen visar att det pågår och laddar sedan ner zip-filen. */
export function PackageDownload({ href, name }: { href: string; name: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const download = async () => {
    setState("busy");
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
      <button type="button" onClick={download} disabled={state === "busy"} aria-busy={state === "busy"} className="nw-btn nw-club-btn inline-flex items-center gap-2 disabled:opacity-80">
        {state === "busy" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
        {state === "busy" ? "Bygger paketet …" : "Ladda ner (zip)"}
      </button>
      <p role="status" className="text-[12px] text-white/70">
        {state === "busy" ? "Tar upp till en halv minut första gången" : state === "error" ? "Det gick inte – försök igen" : ""}
      </p>
    </div>
  );
}

export function CopyButton({ text, label = "Kopiera" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        })
      }
      className="nw-hit shrink-0 text-[12.5px] font-medium text-[var(--nw-ink)] underline decoration-[var(--nw-line)] underline-offset-4 hover:decoration-[var(--nw-ink)]"
    >
      {done ? "Kopierat ✓" : label}
    </button>
  );
}
