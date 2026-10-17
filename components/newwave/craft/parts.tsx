import { NW_CATALOG, type NwProduct } from "@/lib/newwave/catalog";
import type { ApprovalStatus } from "@/lib/newwave/store";

export function Crest({ name, logo, colors, size = 44 }: { name: string; logo?: string; colors: [string, string]; size?: number }) {
  if (logo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    );
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3);
  return (
    <span
      aria-hidden
      className="nw-club-heading grid shrink-0 place-items-center rounded-[30%] leading-none tracking-[-0.02em]"
      style={{ width: size, height: size, fontSize: Math.round(size * (initials.length > 2 ? 0.3 : 0.38)), background: colors[0], color: colors[1], boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }}
    >
      {initials}
    </span>
  );
}

export function Sparkline({ values, className = "h-8 w-24" }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 32;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden preserveAspectRatio="none">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="currentColor" opacity="0.08" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const STATUS_PILL: Record<ApprovalStatus, { label: string; cls: string }> = {
  väntar: { label: "Väntar", cls: "bg-[#FFF4D6] text-[#7A5A00]" },
  godkänd: { label: "Godkänd", cls: "bg-[#E6F4EA] text-[#1E6B34]" },
  ändring: { label: "Ändras", cls: "bg-[#FDECEC] text-[#9B1C1C]" },
};

export const CLUB_PILL = {
  aktiv: { label: "Aktiv", dot: "bg-[#22A35A]" },
  lugn: { label: "Lugn", dot: "bg-[#E0A800]" },
  inaktiv: { label: "Inaktiv", dot: "bg-[#C9C9C4]" },
} as const;

export const fmtDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));
export const fmtKr = (n: number) => `${new Intl.NumberFormat("sv-SE").format(n)} kr`;
export const fmtN = (n: number) => new Intl.NumberFormat("sv-SE").format(n);

const BY_PHOTO = new Map(NW_CATALOG.map((p) => [p.photo, p]));

/** Materialets bild; har produkten på bilden anpassats i designstudion visas studions bild. */
export const materialImage = (m: { image?: string; designs?: Record<string, { mockupUrl: string }> }) => {
  const p = m.image ? BY_PHOTO.get(m.image) : undefined;
  return (p && m.designs?.[p.id]?.mockupUrl) || m.image;
};

/** Klubbmärket som tryck: centrerat i produktens tryckyta, lite mindre än hela ytan. */
const printBox = (b: NwProduct["box"]) => ({ left: `${(b.x + b.w * 0.15) * 100}%`, top: `${(b.y + b.h * 0.04) * 100}%`, width: `${b.w * 0.7 * 100}%`, height: `${b.h * 0.7 * 100}%` });

export function MaterialThumb({ image, kind, title, club }: { image?: string; kind: string; title: string; club?: { name: string; logo?: string; logoDark?: string; colors: [string, string] } }) {
  if (!image)
    return (
      <div className="flex h-full flex-col justify-end gap-2 p-3 sm:p-4" style={{ background: club?.colors[0] ?? "var(--nw-soft)", color: club?.colors[1] ?? "var(--nw-ink)" }}>
        <span className="nw-club-heading line-clamp-3 text-[15px] leading-[1.15] sm:text-[17px]">{title}</span>
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] opacity-70">{kind}</span>
      </div>
    );
  const product = BY_PHOTO.get(image);
  return (
    <div className="relative h-full">
      <div className="relative mx-auto aspect-square h-full max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" className="h-full w-full object-contain" />
        {product && club?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(product.dark && club.logoDark) || club.logo} alt="" aria-hidden loading="lazy" className={`absolute object-contain object-top ${product.dark ? "" : "mix-blend-multiply"}`} style={printBox(product.box)} />
        ) : product && club ? (
          <span className="absolute grid place-items-start justify-center" style={printBox(product.box)}>
            <Crest name={club.name} colors={club.colors} size={30} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
