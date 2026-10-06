import Link from "next/link";
import { notFound } from "next/navigation";
import { CLUBS } from "@/lib/club";
import { ShopHeader } from "@/components/ShopHeader";
import { listProducts } from "@/lib/intersport";

export const dynamic = "force-dynamic";

export default async function ClubShop({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = CLUBS[clubId];
  if (!club) notFound();
  const products = await listProducts(clubId);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-sm:[&>div:last-child]:px-4 max-sm:[&_header>div]:px-4 max-sm:[&_header_img]:h-[15px] max-sm:[&_nav]:gap-3.5 max-sm:[&_nav]:text-[13px]">
        <ShopHeader clubName={club.name} />
      </div>
      <section className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-4 rounded-2xl bg-[#234B9A] px-5 py-5 text-white sm:gap-6 sm:px-8 sm:py-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/v1/brand/${club.id}/${club.brand.crest.farg}`} alt="" className="h-14 w-auto shrink-0 sm:h-20" />
          <div className="min-w-0">
            <h1 className="text-2xl font-black uppercase [overflow-wrap:anywhere] sm:text-3xl">{club.name} klubbshop</h1>
            <p className="text-[15px] text-white/80 sm:text-base">
              {club.tagline} · Nya motiv varje vecka · Tryckt på beställning · Varje köp stöttar klubben
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-4">
          <h2 className="text-lg font-bold">Nyheter ({products.length})</h2>
          <Link href="/autopilot" className="-my-3 inline-block py-3 text-sm text-[#0A2A6B] underline">
            Så publicerades de här →
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-[#F5F5F7] p-10 text-center text-sm text-[#6E6E73]">
            Inga produkter ännu. Starta autopiloten så publicerar klubbagenten de första produkterna.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-10 pb-24 sm:gap-x-5 md:grid-cols-4">
            {products.map((p) => {
              const img = p.images.find((i) => i.kind === "foto") ?? p.images[0];
              return (
                <Link key={p.id} href={`/intersport/${club.id}/${p.id}`} className="group">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#F5F5F7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute left-3 top-3 rounded bg-[#E30613] px-2 py-0.5 text-[11px] font-bold uppercase text-white">Nyhet</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold uppercase text-[#6E6E73]">Craft · {p.tags.includes("Satir") ? "Supporterhumor" : "Klubbmerch"}</p>
                  <p className="mt-0.5 text-sm leading-snug">{p.title}</p>
                  <p className="mt-1 font-bold">{p.priceSek} kr</p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
