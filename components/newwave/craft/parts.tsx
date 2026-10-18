import { ProductMock } from "@/components/newwave/shop/ProductMock";
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

/** Platshållarmärket mitt i tryckytan, för klubbar utan logga. */
const printBox = ({ print: s }: NwProduct) => ({ left: `${(s.cx - s.w / 2) * 100}%`, top: `${(s.cy - s.h / 2) * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` });

type ThumbClub = { name: string; logo?: string; logoDark?: string; colors: [string, string] };

const TSHIRT = NW_CATALOG.find((p) => p.id === "p001")?.photo;

export function MaterialThumb({ image, kind, title, occasion, seed, club }: { image?: string; kind: string; title: string; occasion?: string; seed?: string; club?: ThumbClub }) {
  const src = image ?? (/tryck/i.test(kind) ? TSHIRT : undefined);
  if (!src)
    return <div className="h-full w-full [container-type:size]">{/nyhetsbrev/i.test(kind) ? <NewsletterArt title={title} occasion={occasion} club={club} /> : <PostArt title={title} occasion={occasion ?? kind} seed={seed ?? title} club={club} />}</div>;
  const product = BY_PHOTO.get(src);
  if (product && club?.logo)
    return (
      <div className="relative h-full">
        <ProductMock product={product} logo={club.logo} logoDark={club.logoDark} className="mx-auto h-full max-w-full" />
      </div>
    );
  return (
    <div className="relative h-full">
      <div className="relative mx-auto aspect-square h-full max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
        {product && club ? (
          <span className="absolute grid place-items-center" style={printBox(product)}>
            <Crest name={club.name} colors={club.colors} size={30} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ink = (bg: string) => (luminance(bg) > 0.45 ? "#111111" : "#FFFFFF");
const pickIndex = (seed: string, n: number) => [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % n;

/** Klubbens två färger, där den ljusa ersätts med en ton av huvudfärgen när den är vit. */
function palette(club?: ThumbClub) {
  const [primary, second] = club?.colors ?? ["#111111", "#FFFFFF"];
  const accent = luminance(second) > 0.85 ? `color-mix(in srgb, ${primary} 14%, white)` : second;
  const pop = luminance(second) > 0.85 ? "#FFFFFF" : second;
  return { primary, accent, pop, onPrimary: ink(primary), onAccent: luminance(second) > 0.85 ? primary : ink(second) };
}

function Badge({ club, size, light }: { club?: ThumbClub; size: string; light?: boolean }) {
  if (!club) return null;
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]" style={{ width: size, height: size }}>
      {club.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={club.logo} alt="" loading="lazy" className="absolute inset-[14%] h-[72%] w-[72%] object-contain" />
      ) : (
        <Crest name={club.name} colors={club.colors} size={light ? 20 : 24} />
      )}
    </span>
  );
}

/** Ett inlägg till sociala medier i klubbens färger: tre layouter så att flödet inte ser likadant ut. */
function PostArt({ title, occasion, seed, club }: { title: string; occasion: string; seed: string; club?: ThumbClub }) {
  const c = palette(club);
  const variant = pickIndex(seed, 3);
  const name = club?.name ?? "";

  if (variant === 0)
    return (
      <div className="relative flex h-full flex-col justify-between overflow-hidden p-[7cqmin]" style={{ background: c.primary, color: c.onPrimary }}>
        <span aria-hidden className="absolute -right-[18%] -top-[30%] h-[90%] w-[60%] rotate-[24deg]" style={{ background: c.pop, opacity: 0.95 }} />
        <span />
        <span className="relative">
          <span className="flex items-center gap-[3cqmin]">
            <Badge club={club} size="12cqmin" />
            <span className="min-w-0 truncate text-[5.2cqmin] font-semibold uppercase tracking-[0.14em] opacity-80">{occasion}</span>
          </span>
          <span className="nw-club-heading mt-[3cqmin] line-clamp-3 block text-[12cqmin] leading-[0.98]">{title}</span>
        </span>
      </div>
    );

  if (variant === 1)
    return (
      <div className="relative flex h-full flex-col overflow-hidden" style={{ background: c.accent, color: c.onAccent }}>
        <span aria-hidden className="absolute -bottom-[16%] -right-[14%] h-[70%] w-[70%] opacity-[0.14]">
          {club?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logo} alt="" loading="lazy" className="h-full w-full object-contain grayscale" />
          ) : null}
        </span>
        <div className="relative flex min-h-0 flex-1 flex-col justify-center p-[7cqmin]">
          <span className="mb-[3cqmin] text-[5cqmin] font-semibold uppercase tracking-[0.14em] opacity-70">{occasion}</span>
          <span className="nw-club-heading line-clamp-3 text-[12.5cqmin] leading-[0.98]">{title}</span>
          <span className="mt-[3cqmin] h-[1.6cqmin] w-[22cqmin]" style={{ background: c.primary }} />
        </div>
        <div className="relative flex items-center gap-[3cqmin] px-[7cqmin] py-[5cqmin]" style={{ background: c.primary, color: c.onPrimary }}>
          <Badge club={club} size="11cqmin" light />
          <span className="min-w-0 truncate text-[5.2cqmin] font-semibold">{name}</span>
        </div>
      </div>
    );

  return (
    <div className="relative flex h-full flex-col bg-white p-[5cqmin]">
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-[5cqmin] p-[6cqmin]" style={{ background: c.primary, color: c.onPrimary }}>
        <span aria-hidden className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: `repeating-linear-gradient(135deg, ${c.pop} 0 2.2cqmin, transparent 2.2cqmin 6cqmin)` }} />
        <span className="relative flex items-center justify-between gap-[3cqmin]">
          <span className="rounded-full px-[3.4cqmin] py-[1.4cqmin] text-[4.6cqmin] font-semibold uppercase tracking-[0.1em]" style={{ background: c.pop, color: luminance(club?.colors[1] ?? "#FFFFFF") > 0.85 ? c.primary : c.onAccent }}>
            {occasion}
          </span>
          <Badge club={club} size="14cqmin" />
        </span>
        <span className="nw-club-heading relative line-clamp-3 text-[11.5cqmin] leading-[0.98]">{title}</span>
      </div>
    </div>
  );
}

/** Nyhetsbrevet som ett litet mejl: klubbens sidhuvud, rubriken, brödtext och en knapp. */
function NewsletterArt({ title, occasion, club }: { title: string; occasion?: string; club?: ThumbClub }) {
  const c = palette(club);
  return (
    <div className="flex h-full items-end justify-center overflow-hidden px-[9cqmin] pt-[9cqmin]" style={{ background: c.accent }}>
      <div className="flex h-full w-full flex-col overflow-hidden rounded-t-[4cqmin] bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-[3cqmin] px-[5cqmin] py-[4cqmin]" style={{ background: c.primary, color: c.onPrimary }}>
          <Badge club={club} size="11cqmin" light />
          <span className="min-w-0 truncate text-[5cqmin] font-semibold">{club?.name}</span>
        </div>
        <div className="flex flex-1 flex-col gap-[2.6cqmin] p-[5cqmin]">
          {occasion ? <span className="text-[4.2cqmin] font-semibold uppercase tracking-[0.12em] text-[#6F6B63]">{occasion}</span> : null}
          <span className="nw-club-heading line-clamp-2 text-[8cqmin] leading-[1.02] text-[#111]">{title}</span>
          <span className="mt-[1cqmin] h-[2cqmin] w-full rounded-full bg-[#ECECE8]" />
          <span className="h-[2cqmin] w-[86%] rounded-full bg-[#ECECE8]" />
          <span className="h-[2cqmin] w-[64%] rounded-full bg-[#ECECE8]" />
          <span className="mt-[2cqmin] w-fit rounded-full px-[4cqmin] py-[1.8cqmin] text-[4.4cqmin] font-semibold" style={{ background: c.primary, color: c.onPrimary }}>
            Läs mer
          </span>
        </div>
      </div>
    </div>
  );
}
