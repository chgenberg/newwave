import type { Metadata } from "next";
import Link from "next/link";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";
import { DemoFlow } from "@/components/poc/demo/DemoFlow";
import { hasRole } from "@/lib/poc/auth";
import { catalogProduct } from "@/lib/poc/catalog";
import { DEMO_TEMPLATES, demoClubs, demoSkus } from "@/lib/poc/demo";

export const metadata: Metadata = { title: "Guidad demo · Next Wave" };
export const dynamic = "force-dynamic";

/** Den guidade demon: tre klubbar och tre designer, från Crafts design till kunden – på en sida. */
export default async function DemoPage() {
  const [loggedIn, clubs] = await Promise.all([hasRole("craft"), demoClubs()]);
  const skus = demoSkus().map((sku) => ({ sku, name: catalogProduct(sku)?.name.replace(/^Craft /, "").replace(/^Stickad klubbhalsduk$/, "Halsduk") ?? sku }));
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="flex items-center gap-3 border-b border-[rgba(17,17,17,0.07)] px-4 py-3 min-[900px]:px-6">
          <Link href="/newwave/start" className="flex min-h-9 items-center gap-2.5" aria-label="Next Wave – välj ingång">
            <LogoMark size={28} />
            <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
          </Link>
          <span className="text-[14px] text-[#6F6B63]">Guidad demo</span>
        </header>
        <main className="flex-1 px-4 py-8 min-[900px]:px-10 min-[900px]:py-10">
          <p className="nw-mono text-[12px] uppercase tracking-[0.08em] text-[#6F6B63]">Next Wave × Craft · guidad demo</p>
          <h1 className="mt-2 max-w-[820px] text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] min-[900px]:text-[42px]">En design. Varje klubbs egen. Tryckt och stickad på beställning.</h1>
          <p className="mt-3 max-w-[700px] text-[15px] leading-relaxed text-[#4A4740]">
            Craft gör en design en gång. Plattformen gör den till varje klubbs egen – med klubbens namn, färger och märke – och lägger ut den i klubbarnas Intersport-shoppar. När en kund handlar går ordern till tryckeriet och stickeriet med filerna, och kunden följer den hela vägen.
          </p>
          <DemoFlow loggedIn={loggedIn} clubs={clubs} templates={DEMO_TEMPLATES.map((t) => ({ id: t.id, name: t.name }))} skus={skus} />
          <p className="mt-10 max-w-[700px] text-[12.5px] leading-relaxed text-[#8A867E]">
            Demon använder de riktiga funktionerna: shoppen är en demo av Intersports klubbshop (inga pengar dras, inget mejl går till kunden) och affärssystemet är simulerat tills New Waves hubb kopplas in. Demons ordrar märks &quot;Guidad demo&quot;.
          </p>
        </main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
