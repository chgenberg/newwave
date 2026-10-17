"use client";

import { ReactLenis, type LenisRef } from "lenis/react";
import { cancelFrame, frame } from "motion/react";
import { useEffect, useRef } from "react";

/** Designstudion och menyn scrollar själva. */
const prevent = (node: HTMLElement) => node.classList?.contains("cz-wrap");

/** Mjuk scroll för de redaktionella sidorna (startsidan och webbshoppen). Används aldrig i dashboards. */
export function SmoothScroll() {
  const lenis = useRef<LenisRef>(null);

  useEffect(() => {
    const update = ({ timestamp }: { timestamp: number }) => lenis.current?.lenis?.raf(timestamp);
    frame.update(update, true);
    return () => cancelFrame(update);
  }, []);

  return <ReactLenis root ref={lenis} options={{ autoRaf: false, lerp: 0.12, wheelMultiplier: 0.9, prevent }} />;
}
