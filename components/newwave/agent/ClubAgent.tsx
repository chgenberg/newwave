"use client";

import { useEffect, useRef, useState } from "react";
import { drawPost, type PostLook, shrinkPhoto } from "@/lib/newwave/agentPost";
import type { AgentPost, AgentReply, ShopPick } from "@/lib/newwave/klubbagent";

type Art = { feed: string; story: string };
type Msg = {
  id: number;
  role: "user" | "agent";
  text: string;
  photo?: string;
  post?: AgentPost;
  art?: Art;
  merch?: { item: ShopPick; pitch: string };
  quick?: string[];
  state?: "published" | "scheduled";
};
type Published = { id: number; image: string; label: string };
type Props = { clubId: string; look: Omit<PostLook, "font">; shop: ShopPick[]; opener: { text: string; quick: string[] }; samples: { src: string; label: string }[] };

const ENDPOINT = "/api/v1/newwave/klubbagent";
/** Samma gräns som agentens API har per meddelande. */
const MAX_CHARS = 1500;
const clock = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

/** Det agenten får veta om samtalet: texten, att en bild var med och vilket inlägg den redan gjort. */
const history = (msgs: Msg[]) =>
  msgs.slice(-16).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: [m.text, m.photo ? "[Bifogade en bild]" : "", m.post ? `[Inlägg: ${m.post.format}, rubrik "${m.post.title}", text "${m.post.caption}"]` : "", m.merch ? `[Tipsade om ${m.merch.item.name}]` : ""]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_CHARS),
  }));

export function ClubAgent({ clubId, look, shop, opener, samples }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "agent", text: opener.text, quick: opener.quick }]);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState<Published[]>([]);
  const [now, setNow] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useRef(1);

  useEffect(() => {
    const tick = () => setNow(clock.format(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const draw = async (post: AgentPost, shot?: string): Promise<Art | undefined> => {
    const font = (root.current && getComputedStyle(root.current).getPropertyValue("--font-club").trim()) || "sans-serif";
    await Promise.all([document.fonts.load(`700 100px ${font}`), document.fonts.load(`500 40px ${font}`)]).catch(() => undefined);
    const product = post.product ? shop.find((s) => s.id === post.product)?.mockup : undefined;
    const art = { photo: post.format === "shop" ? undefined : shot, product };
    try {
      const [feedImage, storyImage] = await Promise.all([drawPost(post, { ...look, font }, "feed", art), drawPost(post, { ...look, font }, "story", art)]);
      return { feed: feedImage, story: storyImage };
    } catch {
      return undefined;
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if ((!text && !photo) || busy) return;
    const next = [...msgs, { id: ids.current++, role: "user" as const, text, photo: photo ?? undefined }];
    setMsgs(next);
    setInput("");
    setPhoto(null);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, messages: history(next) }) });
      const data = (await res.json().catch(() => ({}))) as Partial<AgentReply> & { error?: string };
      if (!res.ok || typeof data.reply !== "string") throw new Error(data.error ?? "Agenten svarar inte just nu.");
      const post = data.post ?? undefined;
      const art = post ? await draw(post, next.findLast((m) => m.photo)?.photo) : undefined;
      const item = data.merch && shop.find((s) => s.id === data.merch?.item);
      setMsgs((cur) => [...cur, { id: ids.current++, role: "agent", text: data.reply ?? "", post, art, merch: item && data.merch ? { item, pitch: data.merch.pitch } : undefined, quick: data.quick }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agenten svarar inte just nu.");
    } finally {
      setBusy(false);
    }
  };

  const attach = async (file: File | undefined) => {
    if (!file?.type.startsWith("image/")) return;
    setError("");
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setError("Bilden gick inte att läsa. Prova en JPG eller PNG.");
    }
  };

  const publish = (m: Msg, at?: string) => {
    if (!m.art) return;
    const image = m.art.feed;
    setMsgs((cur) => [
      ...cur.map((x) => (x.id === m.id ? { ...x, state: at ? ("scheduled" as const) : ("published" as const) } : x)),
      { id: ids.current++, role: "agent", text: at ? `Schemalagt: inlägget och storyn går ut på Instagram och Facebook ${at.toLowerCase()}.` : "Klart! Inlägget och storyn ligger nu på Instagram och Facebook. 💛🖤", quick: m.quick },
    ]);
    setFeed((f) => [{ id: m.id, image, label: at ? `Schemalagt · ${at}` : `Publicerat ${clock.format(new Date())}` }, ...f]);
  };

  const last = msgs.at(-1);
  return (
    <div ref={root} className="grid gap-8 min-[860px]:grid-cols-[minmax(0,370px)_minmax(0,1fr)]">
      <div
        className="mx-auto w-full max-w-[370px] rounded-[48px] bg-[#111] p-[10px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attach(e.dataTransfer.files[0]);
        }}
      >
        <div className="flex h-[min(760px,calc(100dvh-140px))] min-h-[560px] flex-col overflow-hidden rounded-[38px] bg-[#ECE8DF]">
          <div className="flex items-center justify-between bg-[var(--club)] px-7 pb-1 pt-3 text-[12px] font-semibold text-white">
            <span>{now}</span>
            <span className="h-[22px] w-[86px] rounded-full bg-black" aria-hidden />
            <span aria-hidden>5G ▮</span>
          </div>
          <div className="flex items-center gap-3 bg-[var(--club)] px-4 pb-3 pt-1 text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.crest} alt="" className="h-9 w-9 rounded-full bg-white object-contain p-1" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-tight">{look.name} · Agenten</p>
              <p className="text-[12px] leading-tight text-white/70">{busy ? "skriver…" : "svarar direkt"}</p>
            </div>
          </div>

          <div ref={list} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-4" aria-live="polite" aria-label="Samtalet med agenten">
            {msgs.map((m) => (
              <Bubble key={m.id} m={m} clubId={clubId} onPublish={publish} onAsk={(t) => void send(t)} />
            ))}
            {busy ? (
              <div className="flex">
                <span className="inline-flex gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3.5 shadow-sm" aria-label="Agenten skriver">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--nw-muted)]" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            ) : last?.role === "agent" && last.quick?.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {last.quick.map((q) => (
                  <button key={q} type="button" onClick={() => void send(q)} className="rounded-full border border-[var(--club)]/25 bg-white px-3 py-1.5 text-left text-[12.5px] text-[var(--club)] shadow-sm hover:border-[var(--club)]">
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
            {error ? <p className="rounded-xl bg-white px-3 py-2 text-[12.5px] text-[#B42318]">{error}</p> : null}
          </div>

          {photo ? (
            <div className="flex items-center gap-3 border-t border-black/5 bg-white/80 px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Bilden som skickas" className="h-12 w-12 rounded-lg object-cover" />
              <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-[var(--nw-muted)]">Syns barn på bilden? Publicera bara om föräldrarna har godkänt.</p>
              <button type="button" onClick={() => setPhoto(null)} className="text-[12px] font-medium text-[var(--nw-muted)] hover:text-[var(--nw-ink)]" aria-label="Ta bort bilden">
                Ta bort
              </button>
            </div>
          ) : msgs.some((m) => m.photo) ? null : (
            <div className="flex items-center gap-2 border-t border-black/5 bg-white/60 px-3 py-2">
              <p className="text-[11.5px] text-[var(--nw-muted)]">Ingen bild till hands?</p>
              <div className="ml-auto flex gap-1.5">
                {samples.map((s) => (
                  <button key={s.src} type="button" onClick={() => setPhoto(s.src)} className="overflow-hidden rounded-lg ring-[var(--club)] hover:ring-2" aria-label={`Använd exempelbilden ${s.label}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt="" className="h-10 w-10 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <form
            className="flex items-center gap-2 bg-[#F6F4EF] px-2.5 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} onClick={(e) => (e.currentTarget.value = "")} />
            <button type="button" onClick={() => fileInput.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--club)] hover:bg-black/5" aria-label="Bifoga en bild">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13.5" r="3.5" />
              </svg>
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv ett meddelande"
              maxLength={600}
              aria-label="Meddelande till agenten"
              className="h-10 min-w-0 flex-1 rounded-full bg-white px-4 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
            />
            <button type="submit" disabled={busy || (!input.trim() && !photo)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--club)] text-white disabled:opacity-40" aria-label="Skicka">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
                <path d="M4 11.5 20 4l-6.5 16-2.5-6.5z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-6">
        <section>
          <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Så fungerar det</h2>
          <ol className="mt-3 space-y-3 text-[14px] leading-relaxed text-[var(--nw-muted)]">
            {[
              ["Skriv eller skicka en bild", "från läktaren, i WhatsApp eller Messenger – som till en kollega."],
              ["Agenten gör inlägget", "i klubbens färger med märket, och följer regelboken: inga barns namn eller nummer."],
              ["Ett tryck", "publicerar på Instagram och Facebook, schemalägger eller tipsar om en vara i shoppen."],
            ].map(([head, text], i) => (
              <li key={head} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--club)] text-[12px] font-semibold text-white">{i + 1}</span>
                <span>
                  <span className="font-medium text-[var(--nw-ink)]">{head}</span> {text}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2 className="text-[16px] font-semibold text-[var(--nw-ink)]">Klubbens flöde</h2>
          {feed.length ? (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {feed.map((f) => (
                <li key={f.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.image} alt="" className="aspect-[4/5] w-full rounded-lg object-cover" />
                  <p className="mt-1 truncate text-[11.5px] text-[var(--nw-muted)]">{f.label}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13.5px] text-[var(--nw-muted)]">Det som publiceras hamnar här.</p>
          )}
        </section>
        <p className="rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 text-[12.5px] leading-relaxed text-[var(--nw-muted)]">
          I demot publiceras inget på riktigt. I skarp drift kopplar klubben sina konton via Meta en gång, och agenten nås i WhatsApp och Messenger. Bara texterna görs av AI – bilderna ritas ur klubbens märke och färger.
        </p>
      </aside>
    </div>
  );
}

function Bubble({ m, clubId, onPublish, onAsk }: { m: Msg; clubId: string; onPublish: (m: Msg, at?: string) => void; onAsk: (text: string) => void }) {
  const [view, setView] = useState<"feed" | "story">("feed");
  if (m.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] overflow-hidden rounded-2xl rounded-tr-md bg-[var(--club-soft)] text-[14px] leading-snug text-[var(--nw-ink)] shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {m.photo ? <img src={m.photo} alt="Bilden som skickades" className="max-h-[220px] w-full object-cover" /> : null}
          {m.text ? <p className="whitespace-pre-line px-3.5 py-2 [overflow-wrap:anywhere]">{m.text}</p> : null}
        </div>
      </div>
    );

  return (
    <div className="flex">
      <div className="max-w-[88%] overflow-hidden rounded-2xl rounded-tl-md bg-white text-[14px] leading-snug text-[var(--nw-ink)] shadow-sm">
        <p className="px-3.5 py-2 [overflow-wrap:anywhere]">{m.text}</p>
        {m.post && m.art ? (
          <div className="border-t border-black/5 p-2">
            <div className="mb-2 flex gap-1" role="group" aria-label="Format">
              {(["feed", "story"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${view === v ? "bg-[var(--club)] text-white" : "bg-[var(--nw-soft)] text-[var(--nw-muted)]"}`}>
                  {v === "feed" ? "Inlägg" : "Story"}
                </button>
              ))}
              <a href={m.art[view]} download={`${clubId}-${view === "feed" ? "inlagg" : "story"}.jpg`} className="ml-auto self-center px-1 text-[11.5px] font-medium text-[var(--nw-muted)] underline-offset-2 hover:underline">
                Ladda ner
              </a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.art[view]} alt={`${m.post.kicker}: ${m.post.title}`} className={`mx-auto rounded-lg ${view === "feed" ? "w-full" : "max-h-[400px]"}`} />
            <p className="mt-2 whitespace-pre-line px-1 text-[13px]">{m.post.caption}</p>
            <p className="mt-1 px-1 text-[12.5px] text-[var(--nw-muted)]">{m.post.hashtags.map((h) => `#${h}`).join(" ")}</p>
            {m.state ? (
              <p className="mt-2 px-1 text-[12.5px] font-medium text-[#1D6B3A]">{m.state === "published" ? "✓ Publicerat" : `✓ Schemalagt · ${m.post.when}`}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => onPublish(m)} className="rounded-full bg-[var(--club)] px-3.5 py-1.5 text-[12.5px] font-medium text-white">
                  Publicera nu
                </button>
                {m.post.when && !/^nu$/i.test(m.post.when) ? (
                  <button type="button" onClick={() => onPublish(m, m.post?.when)} className="rounded-full border border-[var(--nw-line)] px-3.5 py-1.5 text-[12.5px] font-medium">
                    {m.post.when}
                  </button>
                ) : null}
                <button type="button" onClick={() => onAsk("Gör texten kortare")} className="rounded-full border border-[var(--nw-line)] px-3.5 py-1.5 text-[12.5px] font-medium">
                  Kortare text
                </button>
              </div>
            )}
          </div>
        ) : null}
        {m.merch ? (
          <div className="border-t border-black/5 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.merch.item.mockup} alt={m.merch.item.name} className="aspect-square w-full rounded-lg bg-[var(--nw-soft)] object-cover" />
            <p className="mt-2 px-1 text-[13px]">{m.merch.pitch}</p>
            <p className="mt-1 px-1 text-[13px] font-semibold">
              {m.merch.item.name} · {m.merch.item.price} kr
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <a href={m.merch.item.href} target="_blank" rel="noreferrer" className="rounded-full bg-[var(--club)] px-3.5 py-1.5 text-[12.5px] font-medium text-white">
                Visa i shoppen ↗
              </a>
              <button type="button" onClick={() => onAsk(`Gör ett inlägg om ${m.merch?.item.name}`)} className="rounded-full border border-[var(--nw-line)] px-3.5 py-1.5 text-[12.5px] font-medium">
                Gör ett inlägg om den
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
