"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition } from "react";
import { DICT, eur, LANG_COOKIE, LANG_NAMES, type Lang, LANGS } from "@/lib/newwave/sportshop/i18n";

const LangContext = createContext<Lang>("de");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang() {
  const lang = useContext(LangContext);
  return { lang, t: DICT[lang], money: (n: number) => eur(n, lang) };
}

function saveLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

/** Språket sparas i en cookie och sidan ritas om på servern, så att allt byter språk på en gång. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Lang) => {
    if (l === lang) return;
    saveLang(l);
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label={t.langLabel} className={`inline-flex h-9 items-center rounded-full bg-[#F1F1EF] p-0.5 text-[12.5px] font-semibold ${pending ? "opacity-60" : ""} ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={l === lang}
          aria-label={LANG_NAMES[l]}
          lang={l}
          className={`h-8 min-w-10 rounded-full px-2.5 uppercase transition ${l === lang ? "bg-white text-[#111] shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-[#6F6B63] hover:text-[#111]"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
