"use client";

import Link from "next/link";
import { useEffect } from "react";

type Event = { type: "visit" | "item" | "click" | "cart"; item?: string } | { type: "order"; number: string; delivery: string; lines: { item: string; qty: number; flock: boolean }[] };

/** Till klubbens butiksstatistik; `sendBeacon` hinner iväg även när sidan byts. */
export function track(clubId: string, e: Event) {
  const url = `/api/v1/newwave/clubshop/${clubId}/event`;
  const body = JSON.stringify(e);
  if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => undefined);
}

let last = { key: "", at: 0 };

/** Ett besök per klubb och flik, och varan om sidan visar en. */
export function ShopBeacon({ clubId, item }: { clubId: string; item?: string }) {
  useEffect(() => {
    const key = `${clubId}:${item ?? ""}:${location.pathname}`;
    if (last.key === key && Date.now() - last.at < 2000) return;
    last = { key, at: Date.now() };
    const visited = `nw-besok:${clubId}`;
    if (!sessionStorage.getItem(visited)) {
      sessionStorage.setItem(visited, "1");
      track(clubId, { type: "visit" });
    }
    if (item) track(clubId, { type: "item", item });
  }, [clubId, item]);
  return null;
}

/** Knappen från klubbens butik till varan hos Intersport. */
export function BuyNowLink({ clubId, item, href, children, className }: { clubId: string; item: string; href: string; children: React.ReactNode; className: string }) {
  return (
    <Link href={href} onClick={() => track(clubId, { type: "click", item })} className={className}>
      {children}
    </Link>
  );
}
