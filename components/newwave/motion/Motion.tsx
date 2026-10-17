"use client";

import { animate, MotionConfig, motion, useInView, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Alla animationer i navet följer användarens inställning för minskad rörelse. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.8, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

/** Tonar upp innehållet första gången det kommer in i bild. */
export function Reveal({ children, delay = 0, y = 24, className, as = "div" }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "section" | "li" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.9, ease: EASE, delay }}>
      {children}
    </Tag>
  );
}

/** Rubrik där orden glider upp ur en mask, ett i taget. Texten finns kvar för skärmläsare och sökmotorer. */
export function SplitText({ text, className, delay = 0, stagger = 0.06, as = "h1" }: { text: string; className?: string; delay?: number; stagger?: number; as?: "h1" | "h2" | "p" }) {
  const Tag = motion[as];
  const words = text.split(" ");
  return (
    <Tag className={className} aria-label={text} initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.3 }}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom [margin-bottom:-0.08em]">
            <motion.span
              className="inline-block will-change-transform"
              variants={{ hidden: { y: "105%" }, shown: { y: "0%", transition: { duration: 1, ease: EASE, delay: delay + i * stagger } } }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

const fmt = new Intl.NumberFormat("sv-SE");
/** Skriver direkt i textnoden så att React behåller sin nod och slutvärdet. */
const write = (node: Text, value: string) => {
  node.data = value;
};
const NUM = /\d[\d\s\u00a0]*\d|\d/;

/** Räknar upp det första talet i en text, t.ex. "12 av 14" eller "88 017 kr", när den kommer in i bild. */
export function CountUp({ value, className, duration = 1.4 }: { value: string | number; className?: string; duration?: number }) {
  const text = String(value);
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current?.firstChild;
    const match = text.match(NUM);
    if (!(el instanceof Text) || reduce || !match) return;
    const target = Number(match[0].replace(/[\s\u00a0]/g, ""));
    const render = (t: number) => text.replace(NUM, fmt.format(Math.round(target * t)));
    if (!seen) {
      write(el, render(0));
      return;
    }
    const controls = animate(0, 1, { duration, ease: EASE, onUpdate: (t) => write(el, render(t)), onComplete: () => write(el, text) });
    return () => {
      controls.stop();
      write(el, text);
    };
  }, [seen, reduce, text, duration]);

  return (
    <span ref={ref} className={className} data-num>
      {text}
    </span>
  );
}
