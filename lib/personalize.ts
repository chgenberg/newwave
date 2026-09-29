import type { Club } from "./types";

export const NAME_MAX = 10;
export const NAME_PATTERN = /^[A-ZÅÄÖÉÜ][A-ZÅÄÖÉÜ .-]{0,9}$/;

export function familyPack(signal: string): { title: string; prints: { name: string; number: string }[] } | null {
  if (/fars dag/i.test(signal)) return { title: "Pappa & Mini", prints: [{ name: "PAPPA", number: "1" }, { name: "MINI", number: "1" }] };
  if (/mors dag/i.test(signal)) return { title: "Mamma & Mini", prints: [{ name: "MAMMA", number: "1" }, { name: "MINI", number: "1" }] };
  return null;
}

export function validatePersonalization(club: Club, name: string, number: string) {
  const n = name.trim().toUpperCase();
  if (!NAME_PATTERN.test(n)) return { ok: false, reason: `Namnet får vara 1–${NAME_MAX} bokstäver (A–Ö).` };
  if (!/^\d{1,2}$/.test(number)) return { ok: false, reason: "Numret ska vara 0–99." };
  const bad = club.bannedWords.find((w) => n.toLowerCase().includes(w));
  if (bad) return { ok: false, reason: "Namnet innehåller ett spärrat ord." };
  return { ok: true as const, name: n, number };
}

export function personalizationRules(club: Club, signal: string) {
  return {
    enabled: true,
    placement: "rygg",
    template: "låst – klubbens typsnitt och färger",
    name: { maxLength: NAME_MAX, pattern: NAME_PATTERN.source },
    number: { min: 0, max: 99 },
    colors: { lightGarment: club.palette[0].hex, darkGarment: "#FFFFFF" },
    moderation: "Namn kontrolleras mot klubbens spärrlista innan tryck",
    familyPack: familyPack(signal),
  };
}
