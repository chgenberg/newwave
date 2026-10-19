import type { Metadata } from "next";
import { SupportChat } from "@/components/newwave/SupportChat";
import { ASA_IF } from "@/lib/newwave/club";

export const metadata: Metadata = { title: `${ASA_IF.name} · Support` };

export default function SupportPage() {
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Klubbsupporten</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Fråga om material, butik, varumärke eller hur hubben fungerar. Supporten känner till det som händer i er dashboard just nu.</p>
      <div className="mt-6">
        <SupportChat clubId={ASA_IF.id} />
      </div>
    </div>
  );
}
