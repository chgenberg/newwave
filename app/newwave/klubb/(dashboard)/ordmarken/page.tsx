import type { Metadata } from "next";
import Link from "next/link";
import { ClubWordmarks } from "@/components/newwave/ClubWordmarks";
import { ASA_IF } from "@/lib/newwave/club";

export const metadata: Metadata = { title: `${ASA_IF.name} · Ordmärken` };

export default function WordmarksPage() {
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Ordmärken</h1>
      <p className="mt-1 max-w-[640px] text-[14.5px] text-[var(--nw-muted)]">
        Craft ritar klubbens namn i amerikansk vintagestil – skrivstil, collegebokstäver och emblem – med {ASA_IF.name}s färger och märke. Rätta det som inte stämmer, välj favoriter och godkänn.{" "}
        <Link href={`/newwave/klubbar/${ASA_IF.id}`} className="underline underline-offset-4">
          Se hur de blir på plaggen
        </Link>
        .
      </p>
      <ClubWordmarks clubId={ASA_IF.id} colorsHref="/newwave/klubb/varumarke" />
    </div>
  );
}
