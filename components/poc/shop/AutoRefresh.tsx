"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Hämtar sidan på nytt med jämna mellanrum, så att statusen uppdateras medan kunden tittar. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
