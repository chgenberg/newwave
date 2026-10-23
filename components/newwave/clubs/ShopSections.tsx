import { kr } from "@/components/newwave/clubshop/pricing";
import { AssortmentEditor, PhotoEditor, type TextField, TextsEditor } from "@/components/newwave/clubs/ClubShopEditors";
import { KpiTiles, RecentOrders, Section, TopItems, VisitsChart } from "@/components/newwave/clubs/DashboardParts";
import { G360_SECTION, G360Tile } from "@/components/newwave/grasrot/ShopCollection";
import { intersportClub } from "@/lib/intersport";
import { sellables } from "@/lib/newwave/clubCollection";
import { type loadClubShop, shopPath } from "@/lib/newwave/clubShop";
import { shopPhoto, shopTexts, standardPhoto, TEXT_MAX } from "@/lib/newwave/clubShopContent";
import { clubShopStats } from "@/lib/newwave/clubShopStats";
import { shopProducts } from "@/lib/newwave/grasrot/shop";
import { SHOP_PREFIX } from "@/lib/newwave/grasrot/urls";

/**
 * Statistiken och det klubben ändrar i butiken. Samma delar i varje klubbs dashboard och i Åsa IF:s, så att det klubben
 * ser och ändrar är detsamma oavsett var.
 */
type ClubShop = NonNullable<Awaited<ReturnType<typeof loadClubShop>>>;

const CARD = "rounded-[24px] bg-[#F7F6F3] p-4 min-[900px]:p-6";

export async function StatsSections({ shop }: { shop: ClubShop }) {
  const id = shop.club.id;
  const [stats, items] = await Promise.all([clubShopStats(id), sellables(shop)]);
  const home = shopPath(id);
  return (
    <>
      <Section id="nyckeltal" title="Så går butiken">
        <KpiTiles stats={stats} />
        <div className="mt-3">
          <VisitsChart stats={stats} />
        </div>
      </Section>

      <Section id="varor" title="Varor och beställningar">
        <div className="grid gap-3 min-[1000px]:grid-cols-2">
          <TopItems stats={stats} items={items.map((s) => ({ ...s, href: `${home}/${s.id}` }))} />
          <RecentOrders stats={stats} />
        </div>
      </Section>
    </>
  );
}

/** `lead` är en egen del överst, t.ex. kollektionerna i Åsa IF:s dashboard. */
export async function WebshopSections({ shop, lead }: { shop: ClubShop; lead?: { id: string; label: string; node: React.ReactNode } }) {
  const { club, content } = shop;
  const id = club.id;
  const [photo, standard, isp, items, g360] = await Promise.all([shopPhoto(id, content), standardPhoto(id), intersportClub(id), sellables(shop), shopProducts(id)]);
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
  const chips = [...(lead ? [[lead.id, lead.label]] : []), ...(g360 ? [[G360_SECTION.id, G360_SECTION.name]] : []), ["texter", "Texter"], ["kontakt", "Om oss och kontakt"], ["foto", "Foto"], ["sortiment", "Sortiment"]];

  return (
    <>
      <nav aria-label="På sidan" className="mt-5 flex flex-wrap gap-2">
        {chips.map(([href, label]) => (
          <a key={href} href={`#${href}`} className="inline-flex h-9 items-center rounded-full border border-[rgba(17,17,17,0.12)] px-3.5 text-[13.5px] font-medium transition hover:border-[#111]">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-10">
        {lead?.node}

        {g360 ? (
          <Section id={G360_SECTION.id} title={G360_SECTION.name} text="Gräsrot 360 med New Wave Group: klubbmärket eller wordmarket på produkterna i Bilaga 2. Ligger överst i butiken, i 3D och i alla leverantörens färger.">
            <ul className="grid grid-cols-2 gap-x-3 gap-y-6 min-[700px]:grid-cols-3 min-[1000px]:grid-cols-5">
              {g360.products.map((p) => (
                <li key={p.id} className="min-w-0">
                  <G360Tile id={id} product={p} color={g360.featured[p.id]} href={`${home}/${SHOP_PREFIX}${p.id}`} />
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] font-medium">
              <a href={`${home}#${G360_SECTION.id}`} className="underline underline-offset-4">
                Se kollektionen i butiken →
              </a>
              <a href={`/newwave/craft/grasrot/${id}`} className="underline underline-offset-4">
                Tryckfiler, herobild och produktionsunderlag →
              </a>
            </div>
          </Section>
        ) : null}

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
            <PhotoEditor clubId={id} shop={home} photo={photo} own={Boolean(content.photo)} standard={standard?.label} color={club.colors[0] ?? "#111111"} />
          </div>
        </Section>

        <Section id="sortiment" title="Sortimentet" text="Tryck på en vara för att dölja den eller visa den igen. Dolda varor syns varken i butiken eller hos Intersport.">
          <AssortmentEditor clubId={id} shop={home} hidden={content.hidden} items={items.map((s) => ({ id: s.id, name: s.name, group: s.group, image: s.image, price: kr(s.priceSek) }))} />
        </Section>
      </div>
    </>
  );
}
