"use client";

import { useEffect, useRef, useState } from "react";
import { Modal, fileToJpeg } from "@/components/ScarfParts";
import { SCARF_TEXT } from "@/lib/scarf";
import { SIGN_PAD, type SignStroke } from "@/lib/scarfDesign";
import type { RecipeId, ScarfIdea } from "@/lib/scarfRecipes";

/** Det beställaren kan ändra på en färdig halsduk. */
type Editable = Pick<ScarfIdea, "recipe" | "front" | "back" | "number" | "roster">;

export type ScarfEditResult<T extends Editable> = {
  idea: T;
  /** Eget foto till porträttet, annars null för exempelfotot. */
  photoFile: string | null;
  /** Egna namnteckningar, annars null för namnen i skrivstil. */
  signFile: string | null;
  strokes: SignStroke[];
  /** En ändring med egna ord som agenten gör, eller tom. */
  instruction: string;
};

type Slot = "fm" | "fs" | "bm" | "bs";
/** Vad raderna betyder i recept där de inte är huvudrad och underrad. */
const SLOTS: Partial<Record<RecipeId, { label?: Partial<Record<Slot, string>>; hide?: Slot[]; max?: Partial<Record<Slot, number>> }>> = {
  bar: { hide: ["fm", "fs", "bs"], label: { bm: "Årtal eller förkortning" }, max: { bm: 6 } },
  retro: { label: { fs: "Årtal i ändarna" } },
  matchdag: { label: { fm: "Vänster halva", fs: "Höger halva" } },
  motiv: { label: { fm: "Text till vänster", fs: "Text till höger" } },
  personlig: { label: { fm: "Namn" } },
  trupp: { label: { fm: "Rubrik" }, hide: ["fs"] },
  portratt: { label: { fm: "Namn och nummer" } },
  autograf: { label: { fm: "Rubrik" } },
};
const DEFAULT: Record<Slot, string> = { fm: "Huvudrad", fs: "Underrad", bm: "Huvudrad", bs: "Underrad" };

const FIELD = "mt-1 h-11 w-full rounded-xl bg-[#F5F5F7] px-3.5 text-[15px] outline-none placeholder:text-[#86868B] focus:ring-2 focus:ring-[#1D1D1F]";
const upper = (s: string) => s.toLocaleUpperCase("sv-SE");

async function upload(body: unknown) {
  const res = await fetch("/api/v1/scarf/agent/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { file?: string; error?: string };
  if (!res.ok || !json.file) throw new Error(json.error || "Kunde inte ladda upp.");
  return json.file;
}

/** Ändra en färdig halsduk: texterna direkt, eget namn, egen trupp, eget foto, egna namnteckningar – eller en rad till agenten. */
export function EditDialog<T extends Editable>({ title, idea, photoFile: photo0, strokes: strokes0, canAsk, onSave, onClose }: { title: string; idea: T; photoFile: string | null; strokes: SignStroke[]; canAsk: boolean; onSave: (next: ScarfEditResult<T>) => void; onClose: () => void }) {
  const slots = SLOTS[idea.recipe] ?? {};
  const [text, setText] = useState<Record<Slot, string>>({ fm: idea.front.main, fs: idea.front.sub, bm: idea.back.main, bs: idea.back.sub });
  const [number, setNumber] = useState(idea.number);
  const [list, setList] = useState(idea.roster.join("\n"));
  const [photoFile, setPhotoFile] = useState(photo0);
  const [strokes, setStrokes] = useState(strokes0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const trupp = idea.recipe === "trupp";
  const autograf = idea.recipe === "autograf";
  const [rows, width] = trupp ? [SCARF_TEXT.players, SCARF_TEXT.player] : [SCARF_TEXT.signers, SCARF_TEXT.sign];

  const field = (slot: Slot) => {
    if (slots.hide?.includes(slot)) return null;
    const max = slots.max?.[slot] ?? (slot === "fm" || slot === "bm" ? SCARF_TEXT.main : SCARF_TEXT.sub);
    return (
      <label key={slot} className="block">
        <span className="text-[12px] text-[#86868B]">{slots.label?.[slot] ?? DEFAULT[slot]}</span>
        <input value={text[slot]} maxLength={max} onChange={(e) => setText((t) => ({ ...t, [slot]: upper(e.target.value) }))} className={FIELD} />
      </label>
    );
  };

  const save = async () => {
    if (busy) return;
    setError(null);
    try {
      let signFile: string | null = null;
      if (autograf && strokes.length) {
        setBusy("Sparar namnteckningarna …");
        signFile = await upload({ kind: "sign", strokes });
      }
      const roster = trupp || autograf ? list.split("\n").map((l) => (trupp ? upper(l) : l).replace(/\s+/g, " ").trim().slice(0, width)).filter(Boolean).slice(0, rows) : idea.roster;
      onSave({ idea: { ...idea, front: { main: text.fm.trim(), sub: text.fs.trim() }, back: { main: text.bm.trim(), sub: text.bs.trim() }, number: number.replace(/\D/g, "").slice(0, 2), roster }, photoFile, signFile, strokes, instruction: instruction.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara ändringen.");
      setBusy(null);
    }
  };

  const front = [field("fm"), field("fs")].filter(Boolean);
  const back = [field("bm"), field("bs")].filter(Boolean);

  return (
    <Modal title={title} eyebrow="Ändra halsduken" onClose={busy ? () => undefined : onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          {front.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Framsida</legend>
              {front}
              {idea.recipe === "personlig" && (
                <label className="block">
                  <span className="text-[12px] text-[#86868B]">Nummer</span>
                  <input value={number} inputMode="numeric" maxLength={2} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} className={FIELD} />
                </label>
              )}
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <legend className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#86868B]">Baksida</legend>
            {back}
          </fieldset>
        </div>

        {(trupp || autograf) && (
          <label className="mt-4 block">
            <span className="text-[12px] text-[#86868B]">{trupp ? `Truppen – en spelare per rad, till exempel 7 NILSSON (högst ${rows})` : `Namn som stickas som namnteckningar – ett per rad (högst ${rows})`}</span>
            <textarea value={list} rows={trupp ? 6 : 3} onChange={(e) => setList(e.target.value.split("\n").slice(0, rows).join("\n"))} className="mt-1 w-full resize-none rounded-xl bg-[#F5F5F7] px-3.5 py-2.5 text-[15px] leading-snug outline-none focus:ring-2 focus:ring-[#1D1D1F]" />
          </label>
        )}

        {autograf && <SignPad strokes={strokes} onChange={setStrokes} />}

        {idea.recipe === "portratt" && (
          <div className="mt-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoFile ? `/api/v1/files/${photoFile}` : "/demo/portrait.jpg"} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium">{photoFile ? "Eget foto" : "Exempelfoto"}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setError(null);
                    setBusy("Laddar upp fotot …");
                    try {
                      setPhotoFile(await upload({ kind: "photo", dataUrl: await fileToJpeg(f) }));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Kunde inte läsa fotot.");
                    } finally {
                      setBusy(null);
                    }
                  }}
                />
                <button type="button" onClick={() => file.current?.click()} className="inline-flex h-10 items-center rounded-full bg-[#F5F5F7] px-4 text-[13.5px] font-medium hover:bg-[#E8E8ED]">
                  Ladda upp foto
                </button>
                {photoFile && (
                  <button type="button" onClick={() => setPhotoFile(null)} className="inline-flex h-10 items-center rounded-full px-3 text-[13.5px] text-[#86868B] hover:text-[#1D1D1F]">
                    Exempelfotot
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {canAsk && (
          <label className="mt-5 block border-t border-black/[0.08] pt-4">
            <span className="text-[12px] text-[#86868B]">Eller be agenten göra om den</span>
            <input value={instruction} maxLength={200} onChange={(e) => setInstruction(e.target.value)} placeholder="Gör om med … till exempel mörkblå botten och ett annat typsnitt" className={FIELD} />
          </label>
        )}

        {error && <p className="mt-3 rounded-2xl bg-[#FDECEA] px-4 py-2.5 text-[13px] text-[#B3261E]">{error}</p>}
        <button type="submit" disabled={Boolean(busy)} className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#1D1D1F] px-6 text-[15px] font-medium text-white transition hover:bg-black disabled:bg-[#C7C7CC]">
          {busy ?? (instruction.trim() ? "Låt agenten göra om" : "Sticka om")}
        </button>
      </form>
    </Modal>
  );
}

/** Ritrutan har halsdukens proportioner. Punkterna sparas i 0–1 och glesas ut, så att en namnteckning blir några hundra punkter. */
const PAD_W = 960;
const PAD_H = PAD_W / SIGN_PAD;

function draw(c: HTMLCanvasElement, list: SignStroke[]) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#1D1D1F";
  ctx.fillStyle = "#1D1D1F";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  for (const s of list) {
    if (!s.length) continue;
    ctx.beginPath();
    s.forEach(([nx, ny], i) => (i === 0 ? ctx.moveTo(nx * c.width, ny * c.height) : ctx.lineTo(nx * c.width, ny * c.height)));
    if (s.length === 1) ctx.lineTo(s[0][0] * c.width + 0.1, s[0][1] * c.height);
    ctx.stroke();
  }
}

function SignPad({ strokes, onChange }: { strokes: SignStroke[]; onChange: (s: SignStroke[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useRef<SignStroke | null>(null);

  useEffect(() => {
    if (ref.current) draw(ref.current, strokes);
  }, [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;
    return [at((e.clientX - r.left) / r.width), at((e.clientY - r.top) / r.height)];
  };

  const finish = () => {
    const cur = active.current;
    active.current = null;
    if (cur?.length && strokes.length < 80) onChange([...strokes, cur]);
    else if (ref.current) draw(ref.current, strokes);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[12px] text-[#86868B]">
        <span>{strokes.length ? "Ritade namnteckningar – de ersätter namnen ovan" : "Eller rita namnteckningarna här, gärna flera bredvid varandra"}</span>
        {strokes.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="underline decoration-black/20 underline-offset-4">
            Rensa
          </button>
        )}
      </div>
      <canvas
        ref={ref}
        width={PAD_W}
        height={PAD_H}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = [point(e)];
        }}
        onPointerMove={(e) => {
          const cur = active.current;
          if (!cur || !ref.current) return;
          const p = point(e);
          const last = cur[cur.length - 1];
          // Tätt liggande punkter tillför inget i stickningen.
          if (cur.length >= 400 || Math.hypot((p[0] - last[0]) * SIGN_PAD, p[1] - last[1]) < 0.012) return;
          cur.push(p);
          draw(ref.current, [...strokes, cur]);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="mt-1 block w-full touch-none rounded-xl border border-black/10 bg-[#F5F5F7]"
        style={{ aspectRatio: `${SIGN_PAD} / 1` }}
      />
    </div>
  );
}
