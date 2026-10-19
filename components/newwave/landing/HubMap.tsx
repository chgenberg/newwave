"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACTORS, HUB_NODES, LEGS, type Payload, PAYLOADS } from "@/lib/newwave/hub";

const IMAGE = "/newwave/hub/hubben-och-new-wave.jpg";
const BLUE = "#1D4ED8";

type Sel = { kind: "core" } | { kind: "api" } | { kind: "profile" } | { kind: "leg" | "payload" | "actor"; id: string };

const CORE = { x: 330, y: 352 };
const PROFILE = { x: 902, y: 352 };
const API_X = 728;
const LEG_W = 204;
const ACTOR_W = 176;
const legAt = (angle: number) => ({ x: CORE.x + 214 * Math.cos((angle * Math.PI) / 180), y: CORE.y + 226 * Math.sin((angle * Math.PI) / 180) });
const payloadY = (i: number) => 170 + i * 80;
const actorY = (i: number) => 124 + i * 77;

/** Det som hör ihop med valet lyser, resten tonas ned. */
function related(pick: Sel | null) {
  const all = { core: true, api: true, profile: true, legs: new Set(LEGS.map((l) => l.id)), payloads: new Set(PAYLOADS.map((p) => p.id)), actors: new Set(ACTORS.map((a) => a.id)) };
  if (!pick) return all;
  const has = (list: Payload[], set: Set<Payload>) => list.some((p) => set.has(p));
  if (pick.kind === "core") return { ...all, payloads: new Set<Payload>(), actors: new Set<string>(), profile: false };
  if (pick.kind === "api") return { ...all, legs: new Set<string>(), actors: new Set<string>() };
  if (pick.kind === "profile") return { ...all, legs: new Set<string>(), core: false };
  const { id } = pick;
  const payloads = new Set<Payload>(
    pick.kind === "payload" ? [id as Payload] : pick.kind === "leg" ? (LEGS.find((l) => l.id === id)?.payloads ?? []) : (ACTORS.find((a) => a.id === id)?.payloads ?? []),
  );
  return {
    core: true,
    api: true,
    profile: true,
    payloads,
    legs: new Set(pick.kind === "leg" ? [id] : LEGS.filter((l) => has(l.payloads, payloads)).map((l) => l.id)),
    actors: new Set(pick.kind === "actor" ? [id] : ACTORS.filter((a) => has(a.payloads, payloads)).map((a) => a.id)),
  };
}

const same = (a: Sel | null, b: Sel) => a?.kind === b.kind && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

function Node({ pick, current, onPick, label, children }: { pick: Sel; current: Sel | null; onPick: (p: Sel) => void; label: string; children: React.ReactNode }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={same(current, pick)}
      className="cursor-pointer outline-none [&:focus-visible>*:first-child]:stroke-[#111] [&:hover_.nw-map-node]:opacity-100"
      onClick={() => onPick(pick)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onPick(pick);
      }}
    >
      {children}
    </g>
  );
}

function Diagram({ pick, onPick }: { pick: Sel | null; onPick: (p: Sel | null) => void }) {
  const on = related(pick);
  const fade = (lit: boolean) => ({ className: "nw-map-node", opacity: lit ? 1 : 0.4 });
  const flowing = (lit: boolean) => `nw-map-node${lit && pick ? " nw-flow" : ""}`;
  const choose = (p: Sel) => onPick(same(pick, p) ? null : p);
  const selected = (p: Sel) => same(pick, p);
  const trunk = on.core && on.api && on.profile;

  return (
    <svg viewBox="0 0 1200 660" className="block h-auto w-full min-w-[860px] select-none" role="group" aria-label="Karta över vår hubb, HUB-API:t och New Waves hubb">
      <rect x="12" y="24" width="660" height="612" rx="30" fill="#F5F5F2" />
      <text x="40" y="60" className="nw-mono" fontSize="12" letterSpacing="1" fill="#6F6B63">
        VÅR PLATTFORM · ISOLERAD
      </text>
      <rect x="796" y="24" width="392" height="612" rx="30" fill="#FFFFFF" stroke="#CFCBC2" strokeDasharray="6 7" />
      <text x="822" y="60" className="nw-mono" fontSize="12" letterSpacing="1" fill="#6F6B63">
        NEW WAVE PROFILE · UTANFÖR
      </text>

      {LEGS.map((l) => {
        const p = legAt(l.angle);
        const lit = on.legs.has(l.id);
        return <line key={l.id} x1={CORE.x} y1={CORE.y} x2={p.x} y2={p.y} stroke={lit && pick ? "#111" : "#D9D6CE"} strokeWidth={lit && pick ? 1.8 : 1.4} className={flowing(lit)} opacity={lit ? 1 : 0.22} />;
      })}

      <path d={`M ${CORE.x + 100} ${CORE.y} H ${API_X}`} stroke={BLUE} strokeWidth="3" className="nw-flow" opacity={trunk || on.api ? 1 : 0.25} />
      <path d={`M ${API_X} ${CORE.y} H ${PROFILE.x - 72}`} stroke={BLUE} strokeWidth="3" className="nw-flow" opacity={trunk || on.api ? 1 : 0.25} />
      {ACTORS.map((a, i) => {
        const y = actorY(i);
        const lit = on.actors.has(a.id);
        return (
          <path
            key={a.id}
            d={`M ${PROFILE.x + 70} ${PROFILE.y} C ${PROFILE.x + 92} ${PROFILE.y}, 980 ${y}, 1004 ${y}`}
            fill="none"
            stroke={lit && pick ? BLUE : "#B9C3DE"}
            strokeWidth={lit && pick ? 1.8 : 1.3}
            strokeDasharray="5 6"
            className={flowing(lit)}
            opacity={lit ? 1 : 0.22}
          />
        );
      })}

      <Node pick={{ kind: "core" }} current={pick} onPick={choose} label={`${HUB_NODES.core.title} – visa vad hubben gör`}>
        <circle cx={CORE.x} cy={CORE.y} r="104" fill="#FFFFFF" stroke={selected({ kind: "core" }) ? "#111" : "#E2DFD7"} strokeWidth="2" strokeDasharray="3 5" />
        <g {...fade(on.core)}>
          <circle cx={CORE.x} cy={CORE.y} r="80" fill="#111111" />
          <text x={CORE.x} y={CORE.y - 22} textAnchor="middle" fontSize="11" letterSpacing="1.4" fill="#ffffff" opacity=".6" className="nw-mono">
            NEXT WAVE
          </text>
          <text x={CORE.x} y={CORE.y + 4} textAnchor="middle" fontSize="21" fontWeight="600" fill="#ffffff">
            Hubben
          </text>
          <text x={CORE.x} y={CORE.y + 26} textAnchor="middle" fontSize="11.5" fill="#ffffff" opacity=".7">
            AI Orchestrator
          </text>
          <text x={CORE.x} y={CORE.y + 98} textAnchor="middle" fontSize="10.5" fill="#6F6B63" className="nw-mono">
            delat datalager
          </text>
        </g>
      </Node>

      {LEGS.map((l) => {
        const p = legAt(l.angle);
        const pk: Sel = { kind: "leg", id: l.id };
        return (
          <Node key={l.id} pick={pk} current={pick} onPick={choose} label={`Ben ${l.n}: ${l.title}`}>
            <g {...fade(on.legs.has(l.id))}>
              <rect x={p.x - LEG_W / 2} y={p.y - 25} width={LEG_W} height="50" rx="25" fill="#FFFFFF" stroke={selected(pk) ? "#111" : "#E2DFD7"} strokeWidth={selected(pk) ? 2 : 1.2} />
              <circle cx={p.x - LEG_W / 2 + 25} cy={p.y} r="16" fill={selected(pk) ? "#111" : "#F1F1EE"} />
              <text x={p.x - LEG_W / 2 + 25} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill={selected(pk) ? "#fff" : "#111"} className="nw-mono">
                {l.n}
              </text>
              <text x={p.x - LEG_W / 2 + 50} y={p.y + 4.5} fontSize="12.5" fontWeight="600" fill="#111">
                {l.title}
              </text>
            </g>
          </Node>
        );
      })}

      <Node pick={{ kind: "api" }} current={pick} onPick={choose} label={`${HUB_NODES.api.title} – visa vad som skickas`}>
        <g {...fade(on.api)}>
          <text x={API_X} y="64" textAnchor="middle" fontSize="13" fontWeight="700" fill={BLUE}>
            HUB-API
          </text>
          <text x={API_X} y="82" textAnchor="middle" fontSize="10.5" fill={BLUE} opacity=".75" className="nw-mono">
            REST + webhooks
          </text>
          <rect x={API_X - 26} y="100" width="52" height="528" rx="26" fill={BLUE} stroke={selected({ kind: "api" }) ? "#111" : "none"} strokeWidth="2.5" />
        </g>
      </Node>
      {PAYLOADS.map((p, i) => {
        const y = payloadY(i);
        const pk: Sel = { kind: "payload", id: p.id };
        /** Paketen ligger halvt på den blå stapeln, så de tonas inte ned: de som inte hör till valet får dämpad text, de som hör till får blå kant. */
        const dim = !on.payloads.has(p.id);
        const lit = Boolean(pick) && !dim && !selected(pk);
        return (
          <Node key={p.id} pick={pk} current={pick} onPick={choose} label={`Paket: ${p.label}`}>
            <g className={dim ? "[&:hover>rect]:stroke-[#1D4ED8] [&:hover>text]:fill-[#1D4ED8]" : undefined}>
              <rect x={API_X - 74} y={y - 15} width="148" height="30" rx="15" fill={selected(pk) ? "#111" : "#FFFFFF"} stroke={selected(pk) ? "#111" : lit ? BLUE : dim ? "#DCE3F5" : "#C7D2FE"} strokeWidth={lit ? 2 : 1} />
              <text x={API_X} y={y + 4.5} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={selected(pk) ? "#fff" : dim ? "#8E9BBF" : BLUE}>
                {p.label}
              </text>
            </g>
          </Node>
        );
      })}

      <Node pick={{ kind: "profile" }} current={pick} onPick={choose} label={`${HUB_NODES.profile.title} – visa vart det fördelas`}>
        <g {...fade(on.profile)}>
          <circle cx={PROFILE.x} cy={PROFILE.y} r="72" fill="#EEF2FF" stroke={selected({ kind: "profile" }) ? "#111" : BLUE} strokeWidth="2" />
          <text x={PROFILE.x} y={PROFILE.y - 12} textAnchor="middle" fontSize="15" fontWeight="700" fill={BLUE}>
            New Wave
          </text>
          <text x={PROFILE.x} y={PROFILE.y + 7} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={BLUE}>
            Profile hub
          </text>
          <text x={PROFILE.x} y={PROFILE.y + 26} textAnchor="middle" fontSize="10.5" fill={BLUE} opacity=".7">
            fördelar vidare
          </text>
        </g>
      </Node>

      {ACTORS.map((a, i) => {
        const y = actorY(i);
        const pk: Sel = { kind: "actor", id: a.id };
        return (
          <Node key={a.id} pick={pk} current={pick} onPick={choose} label={`${a.name}: ${a.sub}`}>
            <g {...fade(on.actors.has(a.id))}>
              <rect x="1004" y={y - 26} width={ACTOR_W} height="52" rx="16" fill="#FFFFFF" stroke={selected(pk) ? "#111" : "#DCE3F5"} strokeWidth={selected(pk) ? 2 : 1.2} />
              <text x="1020" y={y - 3} fontSize="12.5" fontWeight="600" fill="#111">
                {a.name}
              </text>
              <text x="1020" y={y + 14} fontSize="11" fill="#6F6B63">
                {a.sub}
              </text>
            </g>
          </Node>
        );
      })}
    </svg>
  );
}

function Chips<T extends string>({ title, list, onPick }: { title: string; list: { id: T; label: string }[]; onPick: (id: T) => void }) {
  if (!list.length) return null;
  return (
    <div className="mt-5">
      <p className="nw-mono text-[11px] uppercase tracking-[0.06em] text-[#6F6B63]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {list.map((x) => (
          <button key={x.id} type="button" onClick={() => onPick(x.id)} className="rounded-full bg-[#F1F1EE] px-3 py-1.5 text-[12.5px] font-medium text-[#111] transition hover:bg-[#E6E5E0]">
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const INTRO = [
  { n: "1", text: "Allt byggs i vår plattform: hubben styr sju ben som tar fram design, innehåll, priser och offerter." },
  { n: "2", text: "Det som är klart går över ett enda API till New Waves hubb – tryckfiler, ordrar, produktdata och kunddata." },
  { n: "3", text: "New Waves hubb fördelar vidare till tryck, leverantörer, frakt, ekonomi och butiker." },
];

const MORE = [
  { href: "/newwave/teknik", label: "För IT – så är hubben byggd" },
  { href: "/halsduk", label: "Exempel – Halsduk" },
];

function Details({ pick, onPick }: { pick: Sel | null; onPick: (p: Sel | null) => void }) {
  if (!pick)
    return (
      <div>
        <p className="nw-mono text-[11px] uppercase tracking-[0.06em] text-[#6F6B63]">Klicka på en del av kartan</p>
        <h3 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-[#111]">Tre steg, ett API</h3>
        <ol className="mt-4 flex flex-col gap-3">
          {INTRO.map((s) => (
            <li key={s.n} className="flex gap-3 text-[14px] leading-snug text-[#3D3A35]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#111] text-[11.5px] font-semibold text-white">{s.n}</span>
              {s.text}
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => onPick({ kind: "core" })} className="mt-6 inline-flex h-10 items-center rounded-full bg-[#111] px-4 text-[13.5px] font-semibold text-white transition hover:opacity-90">
          Börja i hubben
        </button>
        <ul className="mt-6 flex flex-col gap-2">
          {MORE.map((m) => (
            <li key={m.href}>
              <Link href={m.href} className="group flex items-center justify-between gap-3 rounded-2xl border border-[rgba(17,17,17,0.08)] bg-[#F7F7F5] px-4 py-3.5 text-[14px] font-semibold text-[#111] transition hover:bg-[#F1F1EE]">
                {m.label}
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current transition-transform group-hover:translate-x-0.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );

  const legs = (payloads: Payload[]) => LEGS.filter((l) => l.payloads.some((p) => payloads.includes(p))).map((l) => ({ id: l.id, label: `${l.n} ${l.title}` }));
  const actors = (payloads: Payload[]) => ACTORS.filter((a) => a.payloads.some((p) => payloads.includes(p))).map((a) => ({ id: a.id, label: a.name }));
  const payloads = (ids: Payload[]) => PAYLOADS.filter((p) => ids.includes(p.id));
  const toLeg = (id: string) => onPick({ kind: "leg", id });
  const toPayload = (id: string) => onPick({ kind: "payload", id });
  const toActor = (id: string) => onPick({ kind: "actor", id });

  let kicker = "";
  let title = "";
  let text = "";
  let items: readonly string[] = [];
  let demo: { href: string; label: string } | undefined;
  let extra: React.ReactNode = null;

  if (pick.kind === "core" || pick.kind === "api" || pick.kind === "profile") {
    const n = HUB_NODES[pick.kind];
    ({ kicker, title, description: text, items } = n);
    extra =
      pick.kind === "core" ? (
        <Chips title="De sju benen" list={LEGS.map((l) => ({ id: l.id, label: `${l.n} ${l.title}` }))} onPick={toLeg} />
      ) : pick.kind === "api" ? (
        <Chips title="Paketen som skickas" list={PAYLOADS.map((p) => ({ id: p.id, label: p.label }))} onPick={toPayload} />
      ) : (
        <Chips title="Fördelar till" list={ACTORS.map((a) => ({ id: a.id, label: a.name }))} onPick={toActor} />
      );
    demo = pick.kind === "api" ? { href: "/newwave/new-wave/tryckfiler", label: "Se anropen som kommit in" } : undefined;
  } else if (pick.kind === "leg") {
    const { id } = pick;
    const l = LEGS.find((x) => x.id === id)!;
    kicker = `Ben ${l.n} · i vår plattform`;
    ({ title, description: text, items, demo } = l);
    extra = (
      <>
        <Chips title="Skickar över API:t" list={payloads(l.payloads)} onPick={toPayload} />
        <Chips title="Tas emot av" list={actors(l.payloads)} onPick={toActor} />
      </>
    );
  } else if (pick.kind === "payload") {
    const { id } = pick;
    const p = PAYLOADS.find((x) => x.id === id)!;
    kicker = "Paket över HUB-API:t";
    title = p.label;
    text = p.description;
    extra = (
      <>
        <Chips title="Byggs av" list={legs([p.id])} onPick={toLeg} />
        <Chips title="Tas emot av" list={actors([p.id])} onPick={toActor} />
      </>
    );
  } else {
    const { id } = pick;
    const a = ACTORS.find((x) => x.id === id)!;
    kicker = `Hos New Wave · ${a.sub}`;
    title = a.name;
    text = a.description;
    demo = a.demo;
    extra = (
      <>
        <Chips title="Får" list={payloads(a.payloads)} onPick={toPayload} />
        <Chips title="Från benen" list={legs(a.payloads)} onPick={toLeg} />
      </>
    );
  }

  return (
    <motion.div key={`${pick.kind}-${"id" in pick ? pick.id : ""}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
      <p className="nw-mono text-[11px] uppercase tracking-[0.06em] text-[#6F6B63]">{kicker}</p>
      <h3 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-[#111]">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[#3D3A35]">{text}</p>
      {items.length ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {items.map((t) => (
            <li key={t} className="flex items-center gap-2 text-[13.5px] text-[#111]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#111]" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      {extra}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {demo ? (
          <Link href={demo.href} className="inline-flex h-10 items-center rounded-full bg-[#111] px-4 text-[13.5px] font-semibold text-white transition hover:opacity-90">
            {demo.label} →
          </Link>
        ) : null}
        <button type="button" onClick={() => onPick(null)} className="text-[13px] text-[#6F6B63] underline decoration-[#D9D6CE] underline-offset-4 hover:text-[#111]">
          Visa hela flödet
        </button>
      </div>
    </motion.div>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<Sel | null>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(17,17,17,0.45)] p-2 backdrop-blur-[3px] sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hubmap-title"
        className="flex h-full max-h-full w-full max-w-[1400px] flex-col lg:h-auto overflow-hidden rounded-[26px] bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)]"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-4 border-b border-[rgba(17,17,17,0.07)] px-5 py-4 sm:px-7">
          <div className="min-w-0 flex-1">
            <p className="nw-mono text-[11.5px] uppercase tracking-[0.06em] text-[#6F6B63]">Next Wave Commerce Hub</p>
            <h2 id="hubmap-title" className="mt-1 text-[clamp(20px,2.2vw,28px)] font-semibold leading-tight tracking-[-0.035em] text-[#111]">
              Hubben och benen – så pratar vi med New Waves hubb
            </h2>
          </div>
          <a href={IMAGE} target="_blank" rel="noreferrer" className="hidden h-10 shrink-0 items-center rounded-full px-3 text-[13px] text-[#6F6B63] transition hover:bg-[#F2F2EF] hover:text-[#111] sm:inline-flex">
            Originalbilden
          </a>
          <button ref={close} type="button" onClick={onClose} aria-label="Stäng kartan" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F1F1EE] text-[#111] transition hover:bg-[#E6E5E0]">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="grid min-h-0 flex-1 auto-rows-max overflow-y-auto lg:auto-rows-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
          <div className="min-w-0 overflow-x-auto p-3 sm:p-5 lg:overflow-y-auto">
            <Diagram pick={pick} onPick={setPick} />
            <p className="mt-2 text-center text-[12px] text-[#6F6B63] lg:hidden">Svep i sidled för att se hela kartan</p>
          </div>
          <aside className="relative border-t border-[rgba(17,17,17,0.07)] lg:border-l lg:border-t-0">
            <div className="p-5 sm:p-7 lg:absolute lg:inset-0 lg:overflow-y-auto">
              <Details pick={pick} onPick={setPick} />
            </div>
          </aside>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Kartan över hur vår hubb talar med New Waves hubb: bilden som knapp, och en interaktiv version i en dialog.
 * Med `children` blir knappen bara det innehållet, t.ex. en textlänk.
 */
export function HubMapButton({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  /** Portalen läggs först när kartan öppnats, så att servern och första renderingen är lika. */
  const [used, setUsed] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const show = () => {
    setUsed(true);
    setOpen(true);
  };
  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      {used ? createPortal(<AnimatePresence>{open ? <Dialog onClose={close} /> : null}</AnimatePresence>, document.body) : null}
    </>
  );
}
