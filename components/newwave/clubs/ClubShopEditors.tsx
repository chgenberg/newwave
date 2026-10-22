"use client";

/* eslint-disable @next/next/no-img-element -- klubbens foto och mockups */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { TextKey } from "@/lib/newwave/clubShopContent";

export type TextField = { key: TextKey; label: string; hint: string; max: number; placeholder?: string; area?: boolean; type?: "email" | "tel" };
type Status = { kind: "idle" | "busy" | "ok" | "error"; text?: string };

async function save(clubId: string, body: unknown) {
  const res = await fetch(`/api/v1/newwave/clubshop/${clubId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Det gick inte att spara. Försök igen.");
}

function StatusLine({ status, shop }: { status: Status; shop: string }) {
  if (status.kind === "idle" || status.kind === "busy") return null;
  return (
    <p role="status" className={`text-[13.5px] ${status.kind === "error" ? "text-[#B42318]" : "text-[#1F7A3A]"}`}>
      {status.text}{" "}
      {status.kind === "ok" ? (
        <Link href={shop} className="font-semibold underline underline-offset-4">
          Visa butiken →
        </Link>
      ) : null}
    </p>
  );
}

const BTN = "inline-flex h-11 items-center justify-center rounded-full bg-[#111] px-5 text-[14px] font-semibold text-white transition hover:bg-[#333] disabled:opacity-50";
const GHOST = "inline-flex h-11 items-center justify-center rounded-full border border-[rgba(17,17,17,0.15)] px-5 text-[14px] font-medium transition hover:border-[#111] disabled:opacity-50";

/** Några av butikens texter; tomt fält tar bort texten. */
export function TextsEditor({ clubId, shop, fields, current, submit: label, saved }: { clubId: string; shop: string; fields: TextField[]; current: Partial<Record<TextKey, string>>; submit: string; saved: string }) {
  const router = useRouter();
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, current[f.key] ?? ""])));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "busy" });
    try {
      await save(clubId, texts);
      setStatus({ kind: "ok", text: saved });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 min-[700px]:grid-cols-2">
      {fields.map((f) => {
        const value = texts[f.key];
        const id = `${clubId}-${f.key}`;
        const props = {
          id,
          value,
          "aria-describedby": `${id}-hjalp`,
          maxLength: f.max,
          placeholder: f.placeholder,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            setTexts({ ...texts, [f.key]: e.target.value.replace(/[<>\n\r\t]/g, "") });
            setStatus({ kind: "idle" });
          },
          className: "w-full rounded-xl border border-[#DCDAD4] bg-white px-3 text-[15px] text-[#111] outline-none placeholder:text-[#9A968C] focus:border-[#111]",
        };
        return (
          <div key={f.key} className={`grid content-start gap-1 ${f.area ? "min-[700px]:col-span-2" : ""}`}>
            <span className="flex items-baseline justify-between gap-3 text-[13.5px] font-semibold">
              <label htmlFor={id}>{f.label}</label>
              <span aria-hidden className="text-[12px] font-normal text-[#9A968C]">
                {value.length}/{f.max}
              </span>
            </span>
            {f.area ? <textarea rows={3} {...props} className={`${props.className} resize-none py-2.5 leading-relaxed`} /> : <input type={f.type ?? "text"} {...props} className={`${props.className} h-12`} />}
            <span id={`${id}-hjalp`} className="text-[12.5px] text-[#6F6B63]">
              {f.hint}
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 min-[700px]:col-span-2">
        <button type="submit" disabled={status.kind === "busy"} className={BTN}>
          {status.kind === "busy" ? "Sparar …" : label}
        </button>
        <StatusLine status={status} shop={shop} />
      </div>
    </form>
  );
}

/** Fotot överst i butiken: eget, från klubbens webbplats eller inget. */
/** Fotot överst i butiken; `standard` är bilden butiken visar utan eget foto, t.ex. "bilden från klubbens webbplats". */
export function PhotoEditor({ clubId, shop, photo, own, standard, color }: { clubId: string; shop: string; photo?: string; own: boolean; standard?: string; color: string }) {
  const Standard = standard && standard[0].toUpperCase() + standard.slice(1);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const run = async (task: () => Promise<void>, ok: string) => {
    setStatus({ kind: "busy" });
    try {
      await task();
      setStatus({ kind: "ok", text: ok });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
  };
  const upload = (file: File) =>
    run(async () => {
      const body = new FormData();
      body.set("foto", file);
      const res = await fetch(`/api/v1/newwave/clubshop/${clubId}/foto`, { method: "POST", body });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Bilden gick inte att ladda upp.");
    }, "Fotot ligger nu överst i butiken.");

  return (
    <div className="grid gap-4 min-[760px]:grid-cols-[1.2fr_1fr] min-[760px]:items-center">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[18px]" style={{ background: color }}>
        {photo ? <img src={photo} alt="Fotot överst i butiken" className="absolute inset-0 h-full w-full object-cover" /> : <p className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-white/80">Ingen bild – butiken visar klubbens färg och ordmärke.</p>}
        {status.kind === "busy" ? <span className="absolute inset-0 grid place-items-center bg-black/40 text-[14px] font-medium text-white">Laddar upp …</span> : null}
      </div>
      <div className="grid content-start gap-3">
        <p className="text-[14px] text-[#4A4740]">{own ? "Klubbens eget foto." : photo && Standard ? `${Standard}.` : "Ingen bild."} Lagbilder och läktarbilder blir bäst, gärna liggande och minst 1600 pixlar brett.</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={status.kind === "busy"} onClick={() => input.current?.click()} className={BTN}>
            Ladda upp ett foto
          </button>
          {Standard && (own || !photo) ? (
            <button type="button" disabled={status.kind === "busy"} onClick={() => run(() => save(clubId, { photo: "hemsidan" }), `Butiken visar ${standard}.`)} className={GHOST}>
              {Standard}
            </button>
          ) : null}
          {photo ? (
            <button type="button" disabled={status.kind === "busy"} onClick={() => run(() => save(clubId, { photo: "ingen" }), "Fotot är borttaget.")} className={GHOST}>
              Ingen bild
            </button>
          ) : null}
        </div>
        <StatusLine status={status} shop={shop} />
      </div>
    </div>
  );
}

export type AssortmentItem = { id: string; name: string; group: string; image: string; price: string };

/** Vilka varor som syns i butiken och hos Intersport. */
export function AssortmentEditor({ clubId, shop, items, hidden: initial }: { clubId: string; shop: string; items: AssortmentItem[]; hidden: string[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(() => new Set(initial));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dirty = hidden.size !== initial.length || initial.some((h) => !hidden.has(h));
  const groups = [...new Set(items.map((i) => i.group))];
  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    setStatus({ kind: "idle" });
  };
  const submit = async () => {
    setStatus({ kind: "busy" });
    try {
      await save(clubId, { hidden: [...hidden] });
      setStatus({ kind: "ok", text: "Sparat." });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: (err as Error).message });
    }
  };
  return (
    <div>
      <div className="sticky top-[68px] z-10 -mx-1 flex flex-wrap items-center gap-3 bg-white/90 px-1 py-2 backdrop-blur">
        <p className="text-[14px] text-[#4A4740]">
          <b>{items.length - hidden.size}</b> av {items.length} varor visas
        </p>
        <button type="button" disabled={!dirty || status.kind === "busy"} onClick={submit} className={`${BTN} ml-auto h-10`}>
          {status.kind === "busy" ? "Sparar …" : "Spara sortimentet"}
        </button>
        <StatusLine status={status} shop={shop} />
      </div>
      {groups.map((g) => (
        <div key={g} className="mt-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#6F6B63]">{g}</p>
          <ul className="mt-2 grid grid-cols-2 gap-2.5 min-[600px]:grid-cols-4 min-[1000px]:grid-cols-6">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const off = hidden.has(i.id);
                return (
                  <li key={i.id} className="min-w-0">
                    <button type="button" aria-pressed={!off} onClick={() => toggle(i.id)} className={`group block w-full rounded-[14px] p-1.5 text-left transition ${off ? "bg-[#F2F1EE]" : "bg-white shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] hover:shadow-[inset_0_0_0_1px_#111]"}`}>
                      <span className="relative block aspect-square overflow-hidden rounded-[10px] bg-[#F3F2EF]">
                        <img src={i.image} alt="" loading="lazy" className={`h-full w-full object-cover transition ${off ? "opacity-35 grayscale" : ""}`} />
                        <span className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${off ? "bg-[#111] text-white" : "bg-white text-[#1F7A3A]"}`}>{off ? "Dold" : "Visas"}</span>
                      </span>
                      <span className={`mt-1.5 block truncate px-0.5 text-[12.5px] font-medium ${off ? "text-[#9A968C]" : ""}`}>{i.name}</span>
                      <span className="block px-0.5 text-[12px] text-[#6F6B63]">{i.price}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
