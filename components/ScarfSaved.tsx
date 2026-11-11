"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MaterialView } from "@/components/ScarfMaterial";
import { Badge, Modal, Pictures, QUIET, ScarfActions, downloadZip } from "@/components/ScarfParts";
import { LogoMark } from "@/components/newwave/Logo";
import { removeDesign, savedDesigns, type SavedDesign } from "@/lib/scarfSaved";

/** Sparade designer: halsdukarna besökaren har tagit fram, som de ligger sparade i webbläsaren. */

const when = (t: number) => new Date(t).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Borttagningen går inte att ångra och frågar därför en gång till. */
function Remove({ onRemove }: { onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const id = setTimeout(() => setSure(false), 3500);
    return () => clearTimeout(id);
  }, [sure]);
  return (
    <button type="button" onClick={() => (sure ? onRemove() : setSure(true))} className={sure ? "inline-flex h-10 items-center justify-center rounded-full bg-[#FDECEA] px-4 text-[13.5px] font-medium text-[#B3261E]" : `${QUIET} text-[#6E6E73]`}>
      {sure ? "Ta bort?" : "Ta bort"}
    </button>
  );
}

export function ScarfSaved() {
  const [list, setList] = useState<SavedDesign[] | null>(null);
  const [open, setOpen] = useState<SavedDesign | null>(null);

  useEffect(() => {
    void savedDesigns().then(setList);
  }, []);

  const remove = async (id: string) => {
    await removeDesign(id);
    setList((prev) => prev?.filter((d) => d.id !== id) ?? prev);
  };

  return (
    <main className="flex min-h-screen flex-col bg-white">
      <header className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-8">
        <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5 text-[15px] font-semibold tracking-tight" aria-label="Next Wave – till ingångarna">
          <LogoMark size={28} />
          <span>
            <span className="hidden text-[13px] tracking-[0.18em] sm:inline">NEXT WAVE </span>
            <span className="font-normal text-[#86868B]">Sparade designer</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/halsduk/inspiration" className="hidden h-10 items-center rounded-full bg-[#F5F5F7] px-4 text-[13px] font-medium text-[#1D1D1F] hover:bg-[#E8E8ED] sm:inline-flex">
            Inspirationsbank
          </Link>
          <Link href="/halsduk/agent" className="inline-flex h-10 items-center rounded-full bg-[#1D1D1F] px-4 text-[13px] font-medium text-white hover:bg-black">
            Kör agenten
          </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mt-8 text-center sm:mt-12">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Sparade designer.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-[#6E6E73]">Halsdukarna du har tagit fram. De ligger sparade i den här webbläsaren.</p>
        </div>

        {list && list.length === 0 && (
          <div className="mx-auto mt-10 max-w-md rounded-3xl bg-[#F5F5F7] px-6 py-10 text-center">
            <p className="text-[15px] text-[#424245]">Inga sparade designer än.</p>
            <Link href="/halsduk/agent" className="mt-4 inline-flex h-11 items-center rounded-full bg-[#1D1D1F] px-5 text-[14px] font-medium text-white hover:bg-black">
              Skapa tre förslag
            </Link>
          </div>
        )}

        {list && list.length > 0 && (
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {list.map((d) => (
              <article key={d.id} className="flex flex-col rounded-3xl border border-black/[0.08] p-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge dark>{d.club.name}</Badge>
                  <Badge>{d.recipeLabel}</Badge>
                  {d.stopped && <Badge>Stoppad</Badge>}
                  <span className="ml-auto text-[11.5px] text-[#86868B]">{when(d.runAt)}</span>
                </div>
                <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{d.title}</h3>
                <div className="mt-3 rounded-2xl bg-[#F5F5F7] p-3">
                  <Pictures front={d.info.images.front} back={d.info.images.back} text={d.info.text} />
                </div>
                <div className="mt-auto pt-4">
                  <ScarfActions
                    info={d.info}
                    download={d.download}
                    photo={{ club: d.club.name, headline: d.download.idea.front.main || d.download.idea.back.main, crestUrl: d.club.crest, everyday: d.club.brand, wide: d.club.brand }}
                    extra={
                      <>
                        {d.made && (
                          <button type="button" onClick={() => setOpen(d)} className={QUIET}>
                            Material
                          </button>
                        )}
                        <Remove onRemove={() => void remove(d.id)} />
                      </>
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {open?.made && (
        <Modal title={open.title} eyebrow={`${open.club.name} · material`} onClose={() => setOpen(null)} full>
          <MaterialView copy={open.made.copy} material={open.made.material} notes={open.made.notes} onZip={() => downloadZip({ ...open.download, copy: open.made!.copy, material: open.made!.material }, "/api/v1/scarf/agent/content/zip", "material.zip")} />
        </Modal>
      )}
    </main>
  );
}
