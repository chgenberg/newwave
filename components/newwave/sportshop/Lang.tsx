"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext } from "react";
import { DICT, eur, LANG_NAMES, type Lang, LANGS } from "@/lib/newwave/sportshop/i18n";

const LangContext = createContext<Lang>("de");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: DICT[lang], money: (n: number) => eur(n, lang) };
}

/** Vanliga länkar till /sprache, som sätter cookien på servern och går tillbaka till samma sida. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t } = useLang();
  const query = useSearchParams().toString();
  const back = `${usePathname()}${query ? `?${query}` : ""}`;
  return (
    <div role="group" aria-label={t.langLabel} className={`inline-flex h-9 items-center rounded-full bg-[#F1F1EF] p-0.5 text-[12.5px] font-semibold ${className}`}>
      {LANGS.map((l) => (
        <a
          key={l}
          href={`/newwave/sportshop/sprache?l=${l}&r=${encodeURIComponent(back)}`}
          aria-current={l === lang ? "true" : undefined}
          aria-label={LANG_NAMES[l]}
          lang={l}
          className={`grid h-8 min-w-10 place-items-center rounded-full px-2.5 uppercase transition ${l === lang ? "bg-white text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-[#6F6B63] hover:text-[#111]"}`}
        >
          {l}
        </a>
      ))}
    </div>
  );
}
