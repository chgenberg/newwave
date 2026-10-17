"use client";

/* eslint-disable @next/next/no-img-element */
import { type ComponentProps, useState } from "react";
import { StudioButton } from "@/components/newwave/studio/StudioButton";

const KIDS = /^\d+\/\d+$/;

type View = "bild" | "tryck";

/** Produktens bild och tryckfil i samma ruta, designstudion ett klick bort, och storlekarna som finns. */
export function ProductDetail({
  studio,
  title,
  images,
  printUrl,
  sizes,
  shopUrl,
  header,
  details,
}: {
  studio?: Omit<ComponentProps<typeof StudioButton>, "children" | "className" | "label">;
  title: string;
  images: { url: string; alt: string }[];
  printUrl: string;
  sizes: string[];
  shopUrl: string;
  header: React.ReactNode;
  details: React.ReactNode;
}) {
  const [view, setView] = useState<View>("bild");
  const [image, setImage] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const groups = [
    { label: "Barn", list: sizes.filter((s) => KIDS.test(s)) },
    { label: sizes.some((s) => KIDS.test(s)) ? "Vuxen" : "", list: sizes.filter((s) => !KIDS.test(s)) },
  ].filter((g) => g.list.length);
  const oneSize = sizes.length === 1;
  const views: [View, string][] = [
    ["bild", "Bild"],
    ["tryck", "Trycket"],
  ];
  const link = `${shopUrl}${shopUrl.includes("?") ? "&" : "?"}${size ? `storlek=${encodeURIComponent(size)}` : ""}`.replace(/[?&]$/, "");

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-8">
      <div className="min-w-0">
        <div className="relative aspect-square overflow-hidden rounded-[var(--nw-radius)] bg-[#f4f4f2]">
          {view === "bild" ? <img src={images[image]?.url} alt={images[image]?.alt ?? title} className="h-full w-full object-contain p-4" /> : null}
          {view === "tryck" ? <img src={printUrl} alt={`Tryckfil ${title}`} className="h-full w-full bg-white object-contain p-8" /> : null}
          {studio ? <StudioButton {...studio} label="Anpassa i 3D" /> : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div role="tablist" aria-label="Visa produkten" className="inline-grid grid-flow-col gap-1 rounded-full bg-[var(--nw-soft)] p-1">
            {views.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`h-8 rounded-full px-4 text-[13px] font-medium transition-colors ${view === id ? "bg-white text-[var(--nw-ink)] shadow-[0_1px_3px_rgba(0,0,0,.08)]" : "text-[var(--nw-muted)] hover:text-[var(--nw-ink)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "bild" && images.length > 1 ? (
            <div className="flex gap-1.5">
              {images.map((im, i) => (
                <button
                  key={im.url}
                  type="button"
                  aria-label={`Bild ${i + 1}`}
                  onClick={() => setImage(i)}
                  className={`h-10 w-10 overflow-hidden rounded-lg bg-[#f4f4f2] ring-2 ${i === image ? "ring-[var(--club)]" : "ring-transparent"}`}
                >
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        {header}
        {oneSize ? (
          <p className="mt-6 text-[14px] text-[var(--nw-ink)]">
            <span className="font-medium">Storlek:</span> <span className="text-[var(--nw-muted)]">en storlek</span>
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-baseline justify-between gap-3">
              <p className="text-[14px] font-medium text-[var(--nw-ink)]">Storlek</p>
              <p className="text-[12.5px] text-[var(--nw-muted)]">{size ? `Vald: ${size}` : `${sizes.length} storlekar`}</p>
            </div>
            <div className="mt-2.5 space-y-3">
              {groups.map((g) => (
                <div key={g.label || "alla"}>
                  {g.label ? <p className="mb-1.5 text-[12px] text-[var(--nw-faint)]">{g.label}</p> : null}
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {g.list.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={size === s}
                        onClick={() => setSize(s)}
                        className={`h-11 min-w-0 rounded-xl border text-[13.5px] font-medium transition-colors ${size === s ? "border-[var(--club)] bg-[var(--club)] text-white" : "border-[var(--nw-line)] text-[var(--nw-ink)] hover:border-[var(--nw-ink)]"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!oneSize ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--nw-muted)]">
            Normal passform – välj din vanliga storlek, och den större om du står mellan två.
            {groups.length > 1 ? " Barnstorlekarna anges i längd i cm." : ""}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row md:flex-col lg:flex-row">
          <a href={link} target="_blank" rel="noreferrer" className="nw-btn nw-club-btn justify-center whitespace-nowrap sm:flex-1">
            Visa i butiken hos Intersport
          </a>
          <button
            type="button"
            className="nw-btn nw-btn-ghost justify-center"
            onClick={() =>
              navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              })
            }
          >
            {copied ? "Kopierad ✓" : "Kopiera länk"}
          </button>
        </div>
        {details}
      </div>
    </div>
  );
}
