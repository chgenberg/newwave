import Link from "next/link";
import { notFound } from "next/navigation";
import { CLUBS } from "@/lib/club";
import { listProducts } from "@/lib/intersport";
import { ShopHeader } from "@/components/ShopHeader";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ clubId: string; productId: string }> }) {
  const { clubId, productId } = await params;
  const club = CLUBS[clubId];
  if (!club) notFound();
  const product = (await listProducts(clubId)).find((p) => p.id === productId);
  if (!product) notFound();

  return (
    <main className="min-h-screen bg-white">
      <ShopHeader clubName={club.name} />
      <section className="mx-auto mt-6 grid max-w-6xl gap-10 px-6 pb-24 md:grid-cols-[1.3fr_1fr]">
        <div className="grid grid-cols-2 gap-3">
          {product.images.map((img, i) => (
            <div key={img.url} className={`overflow-hidden rounded-xl bg-[#F5F5F7] ${i === 0 ? "col-span-2" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className={`w-full ${img.kind === "mockup" ? "object-contain p-6" : "object-cover"}`} />
            </div>
          ))}
        </div>
        <div className="md:sticky md:top-6 md:self-start">
          <p className="text-xs font-semibold uppercase text-[#6E6E73]">Craft · {club.name}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{product.title}</h1>
          <p className="mt-3 text-2xl font-black">{product.priceSek} kr</p>
          <p className="mt-4 text-sm leading-relaxed text-[#3A3A3C]">{product.description}</p>
          <p className="mt-6 text-sm font-semibold">Storlek</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {product.sizes.map((s) => (
              <span key={s} className="rounded border border-[#D2D2D7] px-3 py-2 text-sm">
                {s}
              </span>
            ))}
          </div>
          <button type="button" className="mt-6 h-12 w-full rounded-full bg-[#0A2A6B] font-semibold text-white">
            Lägg i varukorgen
          </button>
          <ul className="mt-6 space-y-1.5 text-sm text-[#3A3A3C]">
            <li>✓ Tryckt på beställning för {club.name}</li>
            <li>✓ Varje köp stöttar klubben</li>
            <li>✓ Namn och nummer på ryggen går att lägga till</li>
          </ul>
          <p className="mt-6 text-xs text-[#86868B]">
            Publicerad automatiskt {new Date(product.publishedAt).toLocaleString("sv-SE")} · SKU {product.sku}
          </p>
          <Link href={`/intersport/${club.id}`} className="mt-4 inline-block text-sm text-[#0A2A6B] underline">
            ← Tillbaka till klubbshoppen
          </Link>
        </div>
      </section>
    </main>
  );
}
