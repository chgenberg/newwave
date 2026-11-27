import type { Metadata } from "next";
import Link from "next/link";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";
import { DemoStart } from "@/components/poc/demo/DemoStart";
import { DEMO_STEPS } from "@/components/poc/demo/steps";
import { hasRole } from "@/lib/poc/auth";

export const metadata: Metadata = { title: "Guidad demo · Next Wave" };
export const dynamic = "force-dynamic";

/** Startsidan för den guidade demon: hela flödet på de riktiga sidorna, med en list som leder från steg till steg. */
export default async function DemoPage() {
  const loggedIn = await hasRole("craft");
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] px-4 py-3 min-[900px]:px-6">
          <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5" aria-label="Next Wave – välj ingång">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <span className="text-[14px] text-[#6F6B63]">Guidad demo</span>
        </header>
        <main className="flex-1 px-5 py-8 min-[900px]:px-12 min-[900px]:py-12">
          <p className="nw-mono text-[12px] uppercase tracking-[0.08em] text-[#6F6B63]">Hela flödet · cirka 10 minuter</p>
          <h1 className="mt-2 max-w-[760px] text-[32px] font-semibold leading-[1.08] tracking-[-0.02em] min-[900px]:text-[44px]">Från Crafts design till tryckeriet, stickeriet och kunden.</h1>
          <p className="mt-4 max-w-[680px] text-[15px] leading-relaxed text-[#4A4740]">
            Demon går igenom de riktiga sidorna i tur och ordning. En list längst ner säger vad varje steg visar, och dess knapp gör steget åt er: publicerar en kollektion till tre klubbar i Linköping, lägger Stefans provorder och för den genom tryckeriet och stickeriet. Ni kan också klicka på sidorna själva. En inloggning räcker för alla roller.
          </p>
          <DemoStart loggedIn={loggedIn} />
          <ol className="mt-10 grid gap-x-8 gap-y-3 min-[700px]:grid-cols-2">
            {DEMO_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="nw-mono mt-0.5 w-6 shrink-0 text-[12px] text-[#8A867E]">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[14.5px] font-semibold">{s.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-[#6F6B63]">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-[680px] text-[12.5px] leading-relaxed text-[#8A867E]">
            Shoppen är en demo av Intersports klubbshop: inga pengar dras och inget mejl går till kunden. Affärssystemet är simulerat tills New Waves hubb kopplas in. Demons ordrar märks &quot;Guidad demo&quot; och hamnar i tryckeriets och stickeriets köer här på sajten.
          </p>
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
