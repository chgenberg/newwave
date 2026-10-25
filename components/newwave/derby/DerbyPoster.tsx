"use client";

import { useEffect, useRef, useState } from "react";
import { drawPost, type PostLook, type PostSize } from "@/lib/newwave/agentPost";
import type { AgentPost } from "@/lib/newwave/klubbagent";

type Props = { art: string; kicker: string; title: string; detail: string; look: Omit<PostLook, "font">; file: string; controls?: boolean };

/** Derbyaffischen ritad i webbläsaren ovanpå vinnarens bild: klubbens märke, typsnitt och slogan. */
export function DerbyPoster({ art, kicker, title, detail, look, file, controls = true }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PostSize>("feed");
  const [images, setImages] = useState<Partial<Record<PostSize, string>>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const font = (root.current && getComputedStyle(root.current).getPropertyValue("--font-club").trim()) || "sans-serif";
      await Promise.all([document.fonts.load(`700 100px ${font}`), document.fonts.load(`500 40px ${font}`)]).catch(() => undefined);
      const post: AgentPost = { format: "match", kicker, title, score: null, opponent: null, home: null, detail, team: null, caption: "", hashtags: [], product: null, when: "" };
      const [feed, story] = await Promise.all([drawPost(post, { ...look, font }, "feed", { photo: art }), drawPost(post, { ...look, font }, "story", { photo: art })]);
      if (live) setImages({ feed, story });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [art, kicker, title, detail, look]);

  const src = images[size];
  return (
    <div ref={root}>
      <div className={`relative mx-auto overflow-hidden rounded-[20px] bg-[#1A3770] shadow-[0_24px_60px_-24px_rgba(10,20,50,0.55)] ${size === "feed" ? "aspect-[4/5]" : "aspect-[9/16] max-w-[70%]"}`}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Derbyaffischen: ${title}`} className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-[#234B9A]" aria-label="Affischen ritas" />
        )}
      </div>
      {controls && (
        <div className="mt-3 flex items-center gap-2">
          {(["feed", "story"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={size === v}
              onClick={() => setSize(v)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${size === v ? "bg-[#234B9A] text-white" : "bg-[var(--nw-soft)] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
            >
              {v === "feed" ? "Flöde 4:5" : "Story 9:16"}
            </button>
          ))}
          {src && (
            <a href={src} download={`${file}-${size === "feed" ? "inlagg" : "story"}.jpg`} className="ml-auto text-[12.5px] font-medium text-[var(--nw-muted)] underline-offset-2 hover:text-[var(--nw-ink)] hover:underline">
              Ladda ned
            </a>
          )}
        </div>
      )}
    </div>
  );
}
