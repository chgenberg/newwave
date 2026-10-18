"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const BEAT_MS = 15_000;
const SKIP = /^\/newwave\/besok/;

type Beacon = { type: "view" | "ping" | "film"; sec?: number; pct?: number; ref?: string; lang?: string; screen?: string; tz?: string };

/** En flik är ett besök; id:t lever så länge fliken gör. */
function sessionId() {
  try {
    let id = sessionStorage.getItem("nw.besok");
    if (!id) sessionStorage.setItem("nw.besok", (id = crypto.randomUUID().replace(/-/g, "").slice(0, 20)));
    return id;
  } catch {
    return "flikutanlagring0";
  }
}

export function trackVisit(b: Beacon) {
  const path = location.pathname;
  if (SKIP.test(path)) return;
  fetch("/api/v1/besok", { method: "POST", body: JSON.stringify({ ...b, sid: sessionId(), path: path.slice(0, 300) }), keepalive: true, credentials: "same-origin" }).catch(() => {});
}

/** Loggar sidvisningar och hur länge fliken faktiskt syns, så att statistiksidan kan visa vem som öppnat och använt demot. */
export function VisitTracker() {
  const path = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === path) return;
    const extra =
      last.current === null ? { ref: document.referrer.slice(0, 300) || undefined, lang: navigator.language, screen: `${screen.width}x${screen.height}`, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } : {};
    last.current = path;
    trackVisit({ type: "view", ...extra });
  }, [path]);

  useEffect(() => {
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    const flush = () => {
      if (!since) return;
      const sec = Math.min(60, (Date.now() - since) / 1000);
      since = Date.now();
      if (sec >= 1) trackVisit({ type: "ping", sec });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") since = Date.now();
      else {
        flush();
        since = 0;
      }
    };
    const beat = setInterval(flush, BEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return null;
}
