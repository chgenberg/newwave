"use client";

import { usePathname } from "next/navigation";

/** Navets sidhuvud och sidfot; återförsäljarnas webbshoppar har sina egna. Startsidan kan få en egen variant. */
export function HubChrome({ children, home }: { children: React.ReactNode; home?: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/newwave/s/")) return null;
  return pathname === "/newwave" && home ? home : children;
}
