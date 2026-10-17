"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACTORS, LEGS, PAYLOADS, PORTALS, type Payload } from "@/lib/newwave/hub";

type Focus = { kind: "leg" | "actor" | "payload"; id: string } | null;
type Side = "all" | "hub" | "nw";

const INK = "#2B2D31";
const MUTED = "#6E7076";
const LINE = "#E4E4E1";
const SOFT = "#F4F4F2";

const W = 1740;
const H = 900;
const HUB = { x: 565, y: 480 };
const R = 290;
const API = { x: 1060, y1: 250, y2: 710 };
const NW = { x: 1350, y: HUB.y };

const rad = (deg: number) => (deg * Math.PI) / 180;
const r2 = (n: number) => Math.round(n * 100) / 100;
const intersects = (a: Payload[], b: Payload[]) => a.some((p) => b.includes(p));

const legPos = LEGS.map((leg) => ({
  ...leg,
  x: r2(HUB.x + R * Math.cos(rad(leg.angle))),
  y: r2(HUB.y + R * Math.sin(rad(leg.angle))),
}));

const actorPos = ACTORS.map((actor, i) => {
  const a = rad(-72 + i * 24);
  return { ...actor, x: r2(NW.x + 190 * Math.cos(a)), y: r2(NW.y + 340 * Math.sin(a)) };
});

const chipPos = PAYLOADS.map((p, i) => {
  const above = i < 3;
  const y = above ? NW.y - 52 - (2 - i) * 40 : NW.y + 24 + (i - 3) * 40;
  return { ...p, x: 1104, y, w: 22 + p.label.length * 7.6 };
});

function stars() {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 110 }, () => ({ x: r2(30 + rnd() * (W - 60)), y: r2(80 + rnd() * (H - 120)), r: r2(0.7 + rnd() * 1.5) }));
}
const STARS = stars();

export function HubMap() {
  const [hover, setHover] = useState<Focus>(null);
  const [pinned, setPinned] = useState<Focus>(null);
  const [side, setSide] = useState<Side>("all");
  const focus = hover ?? pinned;

  const lit = useMemo(() => {
    if (!focus) return null;
    let payloads: Payload[] = [];
    if (focus.kind === "leg") payloads = LEGS.find((l) => l.id === focus.id)!.payloads;
    if (focus.kind === "actor") payloads = ACTORS.find((a) => a.id === focus.id)!.payloads;
    if (focus.kind === "payload") payloads = [focus.id as Payload];
    const legs = new Set(
      focus.kind === "leg" ? [focus.id] : LEGS.filter((l) => intersects(l.payloads, payloads)).map((l) => l.id),
    );
    const actors = new Set(
      focus.kind === "actor" ? [focus.id] : ACTORS.filter((a) => intersects(a.payloads, payloads)).map((a) => a.id),
    );
    return { payloads: new Set(payloads), legs, actors };
  }, [focus]);

  const sideDim = (s: "hub" | "nw") => (side !== "all" && side !== s ? 0.18 : 1);
  const legOpacity = (id: string) => (lit && !lit.legs.has(id) ? 0.2 : 1) * sideDim("hub");
  const actorOpacity = (id: string) => (lit && !lit.actors.has(id) ? 0.2 : 1) * sideDim("nw");
  const chipLit = (id: Payload) => !lit || lit.payloads.has(id);

  const open = (f: NonNullable<Focus>) => {
    setHover(null);
    setPinned(f);
  };

  const bind = (f: NonNullable<Focus>) => ({
    onMouseEnter: () => setHover(f),
    onMouseLeave: () => setHover(null),
    onClick: () => open(f),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(f);
      }
    },
    role: "button",
    tabIndex: 0,
    style: { cursor: "pointer", outline: "none" } as const,
  });

  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--nw-line)] bg-white shadow-[var(--nw-shadow)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--nw-line)] px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--nw-ink)] opacity-25" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--nw-ink)]" />
          </span>
          <span className="text-[14px] font-semibold text-[var(--nw-ink)]">Navet</span>
          <span className="hidden text-[13px] text-[var(--nw-muted)] sm:inline">Hovra eller klicka på ett ben, ett paket eller en aktör</span>
        </div>
        <div className="nw-segment ml-auto" role="group" aria-label="Visa del av kartan">
          {(
            [
              ["all", "Allt"],
              ["hub", "Vår hub"],
              ["nw", "Till New Wave"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={side === id} onClick={() => setSide(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative overflow-x-auto overscroll-x-contain bg-[#FCFCFB] [scrollbar-width:none]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[720px] select-none md:min-w-0"
          role="img"
          aria-label="Next Wave Commerce Hub: navet med sju ben, API till New Wave och New Waves aktörer"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPinned(null);
          }}
        >
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#DCDCD8" />
          ))}

          <g opacity={sideDim("hub")} className="nw-map-node">
            <rect x={20} y={36} width={1040} height={840} rx={30} fill="#fff" fillOpacity={0.6} stroke={INK} strokeWidth={1.6} strokeDasharray="1.5 8" strokeLinecap="round" />
            <text x={52} y={76} fontSize={13} fontWeight={600} letterSpacing="0.16em" fill={INK}>
              VÅR PLATTFORM · ISOLERAD
            </text>
            <text x={52} y={98} fontSize={14} fill={MUTED}>
              Allt skapas, granskas och godkänns här
            </text>
            <ellipse cx={HUB.x} cy={HUB.y} rx={180} ry={180} fill="none" stroke={LINE} strokeWidth={1.3} strokeDasharray="3 8" />
            <ellipse cx={HUB.x} cy={HUB.y} rx={R} ry={R} fill="none" stroke={LINE} strokeWidth={1.3} strokeDasharray="3 8" />
          </g>

          <g opacity={sideDim("nw")} className="nw-map-node">
            <rect x={1100} y={36} width={620} height={840} rx={30} fill={SOFT} />
            <text x={1250} y={76} fontSize={13} fontWeight={600} letterSpacing="0.16em" fill={INK}>
              NEW WAVE · UTANFÖR VÅR PLATTFORM
            </text>
            <text x={1250} y={98} fontSize={14} fill={MUTED}>
              Orderflödet: New Wave fördelar till varje aktör
            </text>
          </g>

          {legPos.map((leg) => (
            <line
              key={`l-${leg.id}`}
              x1={HUB.x}
              y1={HUB.y}
              x2={leg.x}
              y2={leg.y}
              stroke={INK}
              strokeWidth={lit?.legs.has(leg.id) ? 2.6 : 1.4}
              opacity={legOpacity(leg.id)}
              className="nw-map-node"
            />
          ))}

          {legPos.map((leg) => {
            const cos = Math.cos(rad(leg.angle));
            const sin = Math.sin(rad(leg.angle));
            const left = cos < -0.25;
            const vertical = Math.abs(cos) <= 0.25;
            const gap = vertical ? 64 : 88;
            const tx = left ? leg.x - gap : leg.x + gap;
            const anchor = left ? "end" : "start";
            const blockH = 30 + leg.items.length * 23;
            const ty = vertical ? (sin < 0 ? leg.y - 52 : leg.y - 30) : leg.y - blockH / 2 + 18;
            const active = focus?.kind === "leg" && focus.id === leg.id;
            return (
              <g key={leg.id} opacity={legOpacity(leg.id)} className="nw-map-node" {...bind({ kind: "leg", id: leg.id })}>
                {leg.items.map((_, i) => {
                  const off = rad((i - (leg.items.length - 1) / 2) * 16);
                  const a = rad(leg.angle) + off;
                  const sx = r2(leg.x + 52 * Math.cos(a));
                  const sy = r2(leg.y + 52 * Math.sin(a));
                  return (
                    <g key={i}>
                      <line x1={leg.x} y1={leg.y} x2={sx} y2={sy} stroke="#C9C9C4" strokeWidth={1.1} />
                      <circle cx={sx} cy={sy} r={3.8} fill={INK} />
                    </g>
                  );
                })}
                <circle cx={leg.x} cy={leg.y} r={active ? 34 : 30} fill={active ? INK : "#fff"} stroke={INK} strokeWidth={1.8} style={{ transition: "all .25s" }} />
                <text x={leg.x} y={leg.y + 6} textAnchor="middle" fontSize={17} fontWeight={600} fill={active ? "#fff" : INK}>
                  {leg.n}
                </text>
                <rect
                  x={left ? tx - 230 : tx - 8}
                  y={ty - 26}
                  width={240}
                  height={blockH + 10}
                  fill="transparent"
                />
                <text x={tx} y={ty} textAnchor={anchor} fontSize={21} fontWeight={600} fill={INK} letterSpacing="-0.01em">
                  {leg.title}
                </text>
                {leg.items.map((item, i) => (
                  <text key={item} x={tx} y={ty + 28 + i * 23} textAnchor={anchor} fontSize={15.5} fill="#55575C">
                    {item}
                  </text>
                ))}
              </g>
            );
          })}

          <g opacity={sideDim("hub")} className="nw-map-node">
            <circle cx={HUB.x} cy={HUB.y} r={132} fill="#fff" stroke={INK} strokeWidth={1.4} strokeDasharray="1 6" strokeLinecap="round" />
            <path
              id="nw-ring"
              d={`M ${HUB.x} ${HUB.y + 116} A 116 116 0 1 1 ${HUB.x} ${HUB.y - 116} A 116 116 0 1 1 ${HUB.x} ${HUB.y + 116}`}
              fill="none"
            />
            <text fontSize={10.5} fontWeight={600} letterSpacing="0.2em" fill={MUTED}>
              <textPath href="#nw-ring" startOffset="50%" textAnchor="middle">
                SHARED DATA LAYER · KUNDER · PRODUKTER · HISTORIK
              </textPath>
            </text>
            <circle cx={HUB.x} cy={HUB.y} r={98} fill={INK} />
            <text x={HUB.x} y={HUB.y - 34} textAnchor="middle" fontSize={11.5} fontWeight={600} letterSpacing="0.2em" fill="#A9ABB0">
              NEXT WAVE
            </text>
            <text x={HUB.x} y={HUB.y - 4} textAnchor="middle" fontSize={23} fontWeight={600} fill="#fff" letterSpacing="-0.01em">
              Commerce Hub
            </text>
            <text x={HUB.x} y={HUB.y + 24} textAnchor="middle" fontSize={15} fill="#D4D5D8">
              Navet
            </text>
            <text x={HUB.x} y={HUB.y + 50} textAnchor="middle" fontSize={12} fill="#9C9EA3" letterSpacing="0.04em">
              AI Orchestrator
            </text>
          </g>

          <line x1={HUB.x + 98} y1={HUB.y} x2={API.x} y2={HUB.y} stroke={INK} strokeWidth={2.4} className="nw-flow" />
          <line x1={API.x + 26} y1={NW.y} x2={NW.x - 78} y2={NW.y} stroke={INK} strokeWidth={2.4} className="nw-flow" />
          <path d={`M ${NW.x - 78} ${NW.y} l -13 -7 v 14 z`} fill={INK} />

          <g>
            <rect x={API.x - 26} y={API.y1} width={52} height={API.y2 - API.y1} rx={26} fill={INK} />
            <text
              x={API.x + 5}
              y={(API.y1 + API.y2) / 2}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              letterSpacing="0.24em"
              fill="#fff"
              transform={`rotate(-90 ${API.x + 5} ${(API.y1 + API.y2) / 2})`}
            >
              HUB-API · REST + WEBHOOKS
            </text>
          </g>

          {chipPos.map((chip) => {
            const on = chipLit(chip.id);
            const strong = lit?.payloads.has(chip.id);
            return (
              <g key={chip.id} opacity={on ? 1 : 0.25} className="nw-map-node" {...bind({ kind: "payload", id: chip.id })}>
                <rect x={chip.x} y={chip.y} width={chip.w} height={28} rx={14} fill={strong ? INK : "#fff"} stroke={INK} strokeWidth={1.2} />
                <text x={chip.x + chip.w / 2} y={chip.y + 18.5} textAnchor="middle" fontSize={13} fontWeight={500} fill={strong ? "#fff" : INK}>
                  {chip.label}
                </text>
              </g>
            );
          })}

          {actorPos.map((a) => (
            <line
              key={`a-${a.id}`}
              x1={NW.x}
              y1={NW.y}
              x2={a.x}
              y2={a.y}
              stroke={INK}
              strokeWidth={lit?.actors.has(a.id) ? 2 : 1.2}
              strokeDasharray="4 6"
              opacity={actorOpacity(a.id)}
              className="nw-map-node"
            />
          ))}
          {actorPos.map((a) => {
            const active = focus?.kind === "actor" && focus.id === a.id;
            return (
              <g key={a.id} opacity={actorOpacity(a.id)} className="nw-map-node" {...bind({ kind: "actor", id: a.id })}>
                <rect x={a.x - 16} y={a.y - 22} width={230} height={48} fill="transparent" />
                <circle cx={a.x} cy={a.y} r={active ? 13 : 11} fill={active ? INK : "#fff"} stroke={INK} strokeWidth={2.2} />
                <text x={a.x + 24} y={a.y + 1} fontSize={17} fontWeight={600} fill={INK}>
                  {a.name}
                </text>
                <text x={a.x + 24} y={a.y + 22} fontSize={13.5} fill={MUTED}>
                  {a.sub}
                </text>
              </g>
            );
          })}

          <g opacity={sideDim("nw")} className="nw-map-node">
            <circle cx={NW.x} cy={NW.y} r={78} fill="#fff" stroke={INK} strokeWidth={2} />
            <circle cx={NW.x} cy={NW.y} r={68} fill="none" stroke={INK} strokeWidth={1} strokeDasharray="2 5" />
            <text x={NW.x} y={NW.y - 6} textAnchor="middle" fontSize={20} fontWeight={600} fill={INK}>
              New Wave
            </text>
            <text x={NW.x} y={NW.y + 18} textAnchor="middle" fontSize={14} fill={MUTED}>
              Profile hub
            </text>
          </g>
        </svg>
      </div>

      <FocusPanel focus={null} onPick={open} />
      {pinned ? (
        <FocusModal onClose={() => setPinned(null)}>
          <FocusPanel focus={pinned} onPick={open} />
        </FocusModal>
      ) : null}
    </div>
  );
}

function FocusModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="nw-fade fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,31,34,0.32)] p-3 backdrop-blur-[3px] sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" className="nw-pop relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(30,31,34,0.25)] sm:p-8">
        <button
          ref={closeRef}
          type="button"
          aria-label="Stäng"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-[var(--nw-muted)] transition-colors hover:bg-[var(--nw-soft)] hover:text-[var(--nw-ink)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

function FocusPanel({ focus, onPick }: { focus: Focus; onPick: (f: NonNullable<Focus>) => void }) {
  const label = (id: Payload) => PAYLOADS.find((p) => p.id === id)!.label;

  if (!focus) {
    return (
      <div className="border-t border-[var(--nw-line)] px-5 py-5 sm:px-6 md:hidden">
        <p className="mb-3 text-[12.5px] text-[var(--nw-muted)]">Svep i kartan för att se hela navet, eller tryck på ett ben.</p>
        <div className="flex flex-wrap gap-2">
          {LEGS.map((leg) => (
            <button key={leg.id} type="button" className="nw-chip" onClick={() => onPick({ kind: "leg", id: leg.id })}>
              {leg.n} {leg.title}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (focus.kind === "leg") {
    const leg = LEGS.find((l) => l.id === focus.id)!;
    const actors = ACTORS.filter((a) => intersects(a.payloads, leg.payloads));
    const portals = PORTALS.filter((p) => leg.portals.includes(p.id));
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="nw-kicker">Ben {leg.n}</p>
          <h3 className="nw-h3 mt-1">{leg.title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--nw-muted)]">{leg.description}</p>
        </div>
        <div>
          <p className="nw-kicker">Skickas via API</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {leg.payloads.map((p) => (
              <span key={p} className="nw-chip nw-chip-dark">
                {label(p)}
              </span>
            ))}
          </div>
          <p className="nw-kicker mt-4">Når hos New Wave</p>
          <p className="mt-1.5 text-[14px] text-[var(--nw-ink)]">{actors.map((a) => a.name).join(" · ")}</p>
        </div>
        <div>
          <p className="nw-kicker">Syns i</p>
          <div className="mt-2 flex flex-col gap-1">
            {portals.map((p) => (
              <Link key={p.id} href={p.href} className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[14px] text-[var(--nw-ink)] hover:bg-[var(--nw-soft)]">
                {p.title}
                <span className="text-[var(--nw-muted)] transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const payloads: Payload[] =
    focus.kind === "actor" ? ACTORS.find((a) => a.id === focus.id)!.payloads : [focus.id as Payload];
  const legs = LEGS.filter((l) => intersects(l.payloads, payloads));
  const actors = ACTORS.filter((a) => intersects(a.payloads, payloads));
  const actor = focus.kind === "actor" ? ACTORS.find((a) => a.id === focus.id)! : null;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="nw-kicker">{actor ? "Aktör hos New Wave" : "Paket via API"}</p>
        <h3 className="nw-h3 mt-1">{actor ? actor.name : label(payloads[0]!)}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--nw-muted)]">
          {actor
            ? `New Wave hämtar det här från navet och skickar vidare – ${actor.sub}.`
            : "Skapas och godkänns i navet, hämtas av New Wave via API och fördelas till aktörerna nedan."}
        </p>
      </div>
      <div>
        <p className="nw-kicker">{actor ? "Tar emot" : "Når"}</p>
        {actor ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {payloads.map((p) => (
              <span key={p} className="nw-chip nw-chip-dark">
                {label(p)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[14px] text-[var(--nw-ink)]">{actors.map((a) => a.name).join(" · ")}</p>
        )}
      </div>
      <div>
        <p className="nw-kicker">Kommer från</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {legs.map((l) => (
            <button key={l.id} type="button" className="nw-chip" onClick={() => onPick({ kind: "leg", id: l.id })}>
              {l.n} {l.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
