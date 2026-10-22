"use client";

import { useEffect } from "react";

/** Formulärfälten går fortfarande att markera, kopiera och klistra i. */
const FIELD = "input, textarea, select, [contenteditable='true']";
const KEYS = new Set(["a", "c", "x", "s", "u", "p"]);

const inField = (t: EventTarget | null) => t instanceof Element && Boolean(t.closest(FIELD));

/**
 * Stoppar markering, kopiering, högerklick, att dra ut bilder, spara, visa källkod och skriva ut i produktion.
 * Knapparna som kopierar en länk använder urklipps-API:t och påverkas inte.
 */
export function NoCopy() {
  useEffect(() => {
    const block = (e: Event) => {
      if (!inField(e.target)) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && KEYS.has(e.key.toLowerCase()) && !inField(e.target)) e.preventDefault();
    };
    const events = ["copy", "cut", "contextmenu", "dragstart", "selectstart"] as const;
    for (const ev of events) document.addEventListener(ev, block);
    document.addEventListener("keydown", keys);
    return () => {
      for (const ev of events) document.removeEventListener(ev, block);
      document.removeEventListener("keydown", keys);
    };
  }, []);
  return null;
}
