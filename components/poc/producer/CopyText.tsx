"use client";

import { useState } from "react";

/** Kopierar en text, t.ex. mottagarens adress till fraktbolagets sida. Går via urklipps-API:t, så det fungerar även där sidans text inte kan markeras. */
export function CopyText({ text, label = "Kopiera adressen" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Kopiera adressen:", text);
    }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex h-8 items-center rounded-md border border-[#CFCFCF] px-2.5 text-[13px] hover:border-[#111]">
      {copied ? "Kopierad ✓" : label}
    </button>
  );
}
