import type { Metadata } from "next";
import Link from "next/link";
import { ClubRegistry } from "@/components/newwave/clubs/ClubRegistry";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";

export const metadata: Metadata = { title: "Klubbregistret · Next Wave" };

export default function ClubRegistryPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-4 py-3 backdrop-blur-xl min-[900px]:gap-5 min-[900px]:px-6">
          <Link href="/newwave/start" className="flex min-h-9 min-w-9 shrink-0 items-center gap-2.5" aria-label="Next Wave – välj ingång">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <span className="text-[14px] text-[#6F6B63]">Klubbregistret</span>
          <Link href="/newwave/start" className="ml-auto inline-flex h-10 items-center rounded-full px-3.5 text-[13.5px] font-medium text-[#111] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.12)] transition hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.35)]">
            ← Välj ingång
          </Link>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 min-[900px]:px-8 min-[900px]:py-6">
          <ClubRegistry />
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
