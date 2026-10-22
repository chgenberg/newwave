import type { Metadata } from "next";
import Link from "next/link";
import { WordmarkLab } from "@/components/newwave/craft/WordmarkLab";
import { craftClub } from "@/lib/newwave/craft";

export const metadata: Metadata = { title: "Craft · Ordmärken" };

/** Ett kort, ett mellanlångt och ett långt klubbnamn, så att varje mall syns i sina ytterlägen. */
const SHOWN = ["asa-if", "molndals-ibk", "hovas-billdal-if"];

export default function CraftWordmarks() {
  const clubs = SHOWN.flatMap((id) => {
    const c = craftClub(id);
    return c ? [{ id: c.id, name: c.name }] : [];
  });
  return (
    <div className="nw-page">
      <Link href="/newwave/craft/designa" className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        ← Designa
      </Link>
      <h1 className="nw-club-heading mt-2 text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ordmärken</h1>
      <p className="mt-1 max-w-[62ch] text-[14.5px] text-[var(--nw-muted)]">
        Mallar som anpassar sig efter varje klubb: namnet delas i Namn 1 och Namn 2, färgerna och märket hämtas från klubben, och långa namn krymper eller får två rader. Välj dem under Ordmärken i Designa. Granskningskön visar klubbar som behöver rättas, och
        klubbarna godkänner själva på sin förhandsvisningssida.
      </p>
      <WordmarkLab clubs={clubs} />
    </div>
  );
}
