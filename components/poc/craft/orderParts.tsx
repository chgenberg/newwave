import type { EventActor, JobStatus, OrderStatus, Producer } from "@/lib/poc/types";

/** Gemensamt för Crafts ordervy och ordersida: statusfärger, namn och datum. */

export const ORDER_STATUSES: OrderStatus[] = ["mottagen", "bekräftad", "i produktion", "delvis skickad", "skickad", "avbruten"];

const GREY = "bg-[var(--nw-soft)] text-[var(--nw-muted)]";
const BLUE = "bg-[#EAF1FE] text-[#1D4ED8]";
const AMBER = "bg-[#FFF4D6] text-[#7A5A00]";
const GREEN = "bg-[#E6F4EA] text-[#1E6B34]";
const RED = "bg-[#FDECEC] text-[#9B1C1C]";

const ORDER_PILL: Record<OrderStatus, string> = { mottagen: GREY, bekräftad: BLUE, "i produktion": AMBER, "delvis skickad": AMBER, skickad: GREEN, avbruten: RED };
const JOB_PILL: Record<JobStatus, string> = { ny: GREY, accepterad: BLUE, "i produktion": AMBER, skickad: GREEN, fel: RED };

export const PRODUCER_NAME: Record<Producer, string> = { tryckeri: "Tryckeriet", stickeri: "Stickeriet" };

export const ACTOR_NAME: Record<EventActor, string> = { butik: "Intersport", affärssystem: "Crafts affärssystem", tryckeri: "Tryckeriet", stickeri: "Stickeriet", craft: "Craft", plattform: "Plattformen" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function OrderPill({ status }: { status: OrderStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ${ORDER_PILL[status] ?? GREY}`}>{cap(status)}</span>;
}

export function JobPill({ status }: { status: JobStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ${JOB_PILL[status] ?? GREY}`}>{cap(status)}</span>;
}

const TZ = "Europe/Stockholm";
export const fmtWhen = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ }).format(new Date(iso));
export const fmtDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));
