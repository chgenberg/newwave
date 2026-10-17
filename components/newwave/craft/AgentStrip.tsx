"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentAction, Suggestion } from "@/lib/newwave/craftAgent";
import { Icon } from "../DashNav";
import { Chevron } from "./Fold";

const TONE = {
  warn: "bg-[#E0A800]",
  tip: "bg-[#3B82F6]",
  good: "bg-[#22A35A]",
} as const;

const DONE: Record<Exclude<AgentAction["kind"], "href">, string> = {
  remind: "Påminnelse skickad",
  onboard: "Uppstartslänk skickad",
  autopilot: "Autopilot påslagen",
};

export async function runAction(action: AgentAction) {
  const body = action.kind === "autopilot" ? { action: "autopilot", clubIds: action.clubIds, on: true } : { action: action.kind, clubIds: action.clubIds };
  const res = await fetch("/api/v1/newwave/craft/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Något gick fel");
}

export function AgentStrip({
  suggestions,
  summary,
  calm = "Allt ser bra ut – inget som behöver göras just nu.",
  children,
  collapsible,
}: {
  suggestions: Suggestion[];
  summary?: string;
  calm?: string;
  children?: React.ReactNode;
  /** Startar som en rad och fälls ut på klick. */
  collapsible?: boolean;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const shown = suggestions.filter((s) => !hidden.includes(s.key));
  const empty = !summary && !shown.length && !children;
  const folded = collapsible && !open && !empty;
  const lead = shown.find((s) => s.tone === "warn") ?? shown[0];

  async function act(s: Suggestion) {
    if (!s.action || s.action.kind === "href") return;
    setBusy(s.key);
    try {
      await runAction(s.action);
      setDone((d) => ({
        ...d,
        [s.key]: DONE[s.action!.kind as keyof typeof DONE],
      }));
      setTimeout(() => router.refresh(), 900);
    } catch (e) {
      setDone((d) => ({
        ...d,
        [s.key]: e instanceof Error ? e.message : "Något gick fel",
      }));
    } finally {
      setBusy(null);
    }
  }

  function dismiss(key: string) {
    setHidden((h) => [...h, key]);
    void fetch("/api/v1/newwave/craft/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", key }),
    });
  }

  return (
    <section aria-label="Craft-agentens förslag" className={`rounded-[26px] bg-[var(--nw-soft)] ${folded ? "p-1.5" : "p-4 sm:p-5"}`}>
      {collapsible && !empty ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full min-w-0 items-center gap-2.5 text-left ${folded ? "rounded-[20px] px-2.5 py-1.5 transition-colors hover:bg-white/70" : ""}`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--nw-ink)] text-white">
            <Icon name="spark" className="h-[15px] w-[15px]" />
          </span>
          <span className="shrink-0 text-[13.5px] font-semibold text-[var(--nw-ink)]">Craft-agenten</span>
          {folded ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-[var(--nw-muted)]">
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[12px] font-medium text-[var(--nw-ink)]">{shown.length} förslag</span>
              {lead ? (
                <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[lead.tone]}`} aria-hidden />
                  <span className="truncate">{lead.title}</span>
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-[var(--nw-muted)]">
            {open ? "Dölj" : "Visa"}
            <Chevron open={open} />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--nw-ink)] text-white">
            <Icon name="spark" className="h-[15px] w-[15px]" />
          </span>
          <p className="text-[13.5px] font-semibold text-[var(--nw-ink)]">Craft-agenten</p>
          {empty ? <p className="truncate text-[13px] text-[var(--nw-muted)]">· {calm}</p> : null}
        </div>
      )}
      {folded ? null : (
        <>
          {summary ? <p className="mt-2.5 max-w-[760px] text-[14px] leading-relaxed text-[var(--nw-ink)]">{summary}</p> : null}
          {children}
          {shown.length ? (
            <ul className={`mt-3 grid gap-2 ${shown.length > 1 ? "sm:grid-cols-2" : ""} ${shown.length > 2 ? "lg:grid-cols-3" : ""}`}>
              {shown.map((s, i) => (
                <li key={s.key} className={`nw-fade min-w-0 flex-col rounded-2xl bg-white p-4 ${i > 0 && !more ? "hidden sm:flex" : "flex"}`}>
                  <p className="flex items-start gap-2 text-[14px] font-semibold leading-snug text-[var(--nw-ink)]">
                    <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE[s.tone]}`} aria-hidden />
                    {s.title}
                  </p>
                  <p className="mt-1 pl-3.5 text-[13px] leading-snug text-[var(--nw-muted)]">{s.detail}</p>
                  <div className="mt-auto flex items-center gap-3 pl-3.5 pt-3">
                    {done[s.key] ? (
                      <span className="text-[13px] font-medium text-[#1E6B34]">✓ {done[s.key]}</span>
                    ) : s.action?.kind === "href" ? (
                      <Link href={s.action.href!} className="nw-btn h-9 px-4 text-[13px]">
                        {s.action.label}
                      </Link>
                    ) : s.action ? (
                      <button type="button" disabled={busy === s.key} onClick={() => act(s)} className="nw-btn h-9 px-4 text-[13px] disabled:opacity-50">
                        {busy === s.key ? "Skickar…" : s.action.label}
                      </button>
                    ) : null}
                    {!done[s.key] ? (
                      <button type="button" onClick={() => dismiss(s.key)} className="nw-hit text-[12.5px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
                        Inte nu
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {shown.length > 1 && !more ? (
            <button type="button" onClick={() => setMore(true)} className="nw-hit mt-2 text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4 sm:hidden">
              Visa {shown.length - 1} förslag till
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
