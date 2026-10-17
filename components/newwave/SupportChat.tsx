"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

function Rich({ text }: { text: string }) {
  const inline = (line: string) => line.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {list.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

const STARTERS = ["Vad väntar på godkännande?", "Hur får vi ut en ny tröja i butiken?", "Vad kostar en hoodie?", "Vad ska vi göra till Fars dag?"];

export function SupportChat({ clubId }: { clubId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/newwave/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, messages: next.slice(-20) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Supporten svarar inte just nu");
      setMessages([...next, { role: "assistant", content: json.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[var(--nw-radius)] border border-[var(--nw-line)]">
      <div className="min-h-[280px] space-y-3 p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-[14.5px] text-[var(--nw-ink)]">Hej! Vad kan jag hjälpa er med?</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="nw-chip h-9 max-w-full px-3.5 text-[13px] hover:border-[var(--nw-ink)]">
                  <span className="truncate">{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed [overflow-wrap:anywhere] ${
                m.role === "user" ? "whitespace-pre-line bg-[var(--club)] text-white" : "bg-[var(--nw-soft)] text-[var(--nw-ink)]"
              }`}
            >
              {m.role === "user" ? m.content : <Rich text={m.content} />}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="flex justify-start">
            <span className="inline-flex gap-1 rounded-2xl bg-[var(--nw-soft)] px-4 py-3.5" aria-label="Supporten skriver">
              {[0, 1, 2].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--nw-muted)]" style={{ animationDelay: `${d * 150}ms` }} />
              ))}
            </span>
          </div>
        ) : null}
        {error ? <p className="text-[13.5px] text-[#B42318]">{error}</p> : null}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-[var(--nw-line)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Skriv en fråga…"
          aria-label="Fråga till supporten"
          className="h-11 min-w-0 flex-1 rounded-full bg-[var(--nw-soft)] px-5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14.5px]"
        />
        <button type="submit" className="nw-btn shrink-0" disabled={busy || !input.trim()}>
          Skicka
        </button>
      </form>
    </div>
  );
}
