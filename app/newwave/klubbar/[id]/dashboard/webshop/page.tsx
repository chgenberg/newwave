import { notFound } from "next/navigation";
import { kr } from "@/components/newwave/clubshop/pricing";
import { AssortmentEditor, PhotoEditor, type TextField, TextsEditor } from "@/components/newwave/clubs/ClubShopEditors";
import { Section } from "@/components/newwave/clubs/DashboardParts";
import { intersportClub } from "@/lib/intersport";
import { registryPhoto } from "@/lib/newwave/clubRegistry";
import { loadClubShop, mockupUrl, shopPath, wordmarkSpec } from "@/lib/newwave/clubShop";
import { shopPhoto, shopTexts, TEXT_MAX } from "@/lib/newwave/clubShopContent";

export const dynamic = "force-dynamic";

const CARD = "rounded-[24px] bg-[#F7F6F3] p-4 min-[900px]:p-6";

/** Det klubben ändrar i butiken: texterna, kontaktuppgifterna, fotot och sortimentet. */
export default async function ClubWebshop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await loadClubShop(id);
  if (!shop) notFound();
  const { club, content, assortment, v } = shop;
  const [photo, site, isp] = await Promise.all([shopPhoto(id, content), registryPhoto(id), intersportClub(id)]);
  const home = shopPath(id);
  const defaults = shopTexts({ name: club.name, tagline: isp?.tagline }, { hidden: [] });
  const ownText = "Lämna tomt för förslaget, som syns i rutan.";
  const top: TextField[] = [
    { key: "headline", label: "Rubrik", hint: `Den stora rubriken överst i butiken. ${ownText}`, max: TEXT_MAX.headline, placeholder: defaults.headline },
    { key: "tagline", label: "Rad hos Intersport", hint: `Under klubbens namn i klubbshoppen hos Intersport. ${ownText}`, max: TEXT_MAX.tagline, placeholder: defaults.tagline },
    { key: "intro", label: "Ingress", hint: `Under rubriken i butiken. ${ownText}`, max: TEXT_MAX.intro, placeholder: defaults.intro, area: true },
  ];
  const contact: TextField[] = [
    { key: "email", label: "E-post", hint: "Till kansliet eller den som svarar på frågor om klubbkläderna.", max: TEXT_MAX.email, placeholder: "kansli@klubben.se", type: "email" },
    { key: "phone", label: "Telefon", hint: "Valfritt.", max: TEXT_MAX.phone, placeholder: "08-123 45 67", type: "tel" },
    { key: "contact", label: "Kontakta oss", hint: "Överst på sidan Kontakta oss i butiken.", max: TEXT_MAX.contact, placeholder: "Frågor om klubbkläderna? Hör av er till kansliet.", area: true },
    { key: "about", label: "Om oss", hint: "Sidan Om oss i butiken. Lämna tomt för en kort standardtext.", max: TEXT_MAX.about, placeholder: "Vilka ni är, vad pengarna från butiken går till …", area: true },
  ];
  const values = (fields: TextField[]) => Object.fromEntries(fields.map((f) => [f.key, content[f.key]]));
  const items = assortment.flatMap((g) => g.items.map((it) => ({ it, group: g.name })));

  return (
    <>
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-[#6F6B63]">{club.name}</p>
      <h1 className="mt-1 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] min-[760px]:text-[40px]">Webshop</h1>
      <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[#4A4740]">Det supportrarna läser och ser i klubbens butik. Det ni sparar syns direkt i butiken och i klubbshoppen hos Intersport.</p>
      <nav aria-label="På sidan" className="mt-5 flex flex-wrap gap-2">
        {[
          ["texter", "Texter"],
          ["kontakt", "Om oss och kontakt"],
          ["foto", "Foto"],
          ["sortiment", "Sortiment"],
        ].map(([href, label]) => (
          <a key={href} href={`#${href}`} className="inline-flex h-9 items-center rounded-full border border-[rgba(17,17,17,0.12)] px-3.5 text-[13.5px] font-medium transition hover:border-[#111]">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-10">
        <Section id="texter" title="Texterna överst" text="Det supportrarna läser först i butiken och hos Intersport.">
          <div className={CARD}>
            <TextsEditor clubId={id} shop={home} fields={top} current={values(top)} submit="Spara texterna" saved="Texterna är sparade." />
          </div>
        </Section>

        <Section id="kontakt" title="Om oss och Kontakta oss" text="Butikens sidor Om oss och Kontakta oss. E-post och telefon syns också längst ner på varje sida. Frågor om en beställning går alltid till Intersports kundservice.">
          <div className={CARD}>
            <TextsEditor clubId={id} shop={home} fields={contact} current={values(contact)} submit="Spara kontaktuppgifterna" saved="Kontaktuppgifterna är sparade." />
          </div>
        </Section>

        <Section id="foto" title="Fotot i butiken" text="Bakom rubriken överst i butiken.">
          <div className={CARD}>
            <PhotoEditor clubId={id} shop={home} photo={photo} own={Boolean(content.photo)} site={Boolean(site)} color={club.colors[0] ?? "#111111"} />
          </div>
        </Section>

        <Section id="sortiment" title="Sortimentet" text="Tryck på en vara för att dölja den eller visa den igen. Dolda varor syns varken i butiken eller hos Intersport.">
          <AssortmentEditor clubId={id} shop={home} hidden={content.hidden} items={items.map(({ it, group }) => ({ id: it.id, name: it.name, group, image: mockupUrl(it.product, wordmarkSpec(it.template.id, it.worn), id, v, 480), price: kr(it.product.priceSek) }))} />
        </Section>
      </div>
    </>
  );
}
