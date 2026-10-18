import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalActions } from "@/components/newwave/ApprovalActions";
import { MerchGrid } from "@/components/newwave/MerchGrid";
import { PackView } from "@/components/newwave/PackView";
import { OfficeMail, ZipButton } from "@/components/newwave/PackZip";
import { WeeklyPick } from "@/components/newwave/WeeklyParts";
import { ASA_IF as CLUB } from "@/lib/club";
import { ASA_IF, packClub } from "@/lib/newwave/club";
import { deliveryFor, deliveryStats } from "@/lib/newwave/hubDelivery";
import { getApproval, readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getApproval(ASA_IF.id, id);
  if (!a) notFound();
  const theme = clubTheme((await readBrand(ASA_IF.id)).palette ?? CLUB.palette);
  const sent = a.status === "godkänd" ? await deliveryFor(ASA_IF.id, a.id) : null;
  const delivery = sent ? { href: `/newwave/new-wave/tryckfiler/${sent.id}`, ...deliveryStats(sent) } : undefined;
  const club = packClub(ASA_IF, theme);
  const zip =
    a.content && a.assets
      ? {
          club,
          clubId: ASA_IF.id,
          slogan: a.slogan ?? a.title,
          story: a.story,
          occasion: a.occasion,
          week: a.weekly?.week,
          content: a.content,
          assets: a.assets,
          photos: a.photos ?? [],
          products: a.products ?? [],
          printFiles: a.printFiles,
          shopUrl: a.shopUrl ?? club.website,
        }
      : null;

  return (
    <div className="nw-page">
      <Link href={a.weekly ? "/newwave/klubb/material/veckan" : "/newwave/klubb/oversikt"} className="text-[13px] text-[var(--nw-muted)] hover:text-[var(--nw-ink)]">
        {a.weekly ? "← Varje vecka" : "← Översikt"}
      </Link>
      <p className="mt-4 text-[12.5px] text-[var(--nw-muted)]">
        {a.weekly ? `Vecka ${a.weekly.week}` : a.kind} · {a.occasion}
        {a.from ? ` · från ${a.from}` : ""}
      </p>
      <h1 className="nw-club-heading mt-1 text-[28px] leading-tight text-[var(--club)] [overflow-wrap:anywhere] sm:text-[34px]">{a.title}</h1>
      {a.story ? <p className="mt-2 text-[14.5px] text-[var(--nw-muted)]">{a.story}</p> : null}

      {zip && a.weekly ? <OfficeMail pack={zip} agent={CLUB.agent.name} sentAt={`Måndag vecka ${a.weekly.week} kl. 07.00`} /> : null}

      {a.weekly ? <WeeklyPick run={a.weekly} /> : null}

      {a.previewUrl || a.products?.length ? (
        <div className="mt-6">
          <MerchGrid title={a.title} printUrl={a.previewUrl} art={a.printFiles} products={a.products ?? []} target={{ kind: "approval", clubId: ASA_IF.id, approvalId: a.id }} />
        </div>
      ) : null}

      {a.knit ? (
        <p className="mt-3 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 text-[14px] text-[var(--nw-muted)]">
          <span className="font-medium text-[var(--nw-ink)]">Plus en stickad halsduk · {a.knit.priceSek} kr</span> – ”{a.knit.front}” på framsidan och ”{a.knit.back}” på baksidan, i klubbens garner.
        </p>
      ) : null}

      {a.status === "väntar" && (a.products?.length || a.knit) && !a.content ? (
        <p className="mt-3 text-[13.5px] text-[var(--nw-muted)]">
          När ni godkänner gör navet produktionsfilerna för varje produkt – tryckfiler, separationer, brodyrfil och stickfil – och skickar dem till New Wave via API.
        </p>
      ) : null}

      {a.content && a.assets ? (
        <PackView
          club={club}
          slogan={a.slogan ?? a.title}
          content={a.content}
          assets={a.assets}
          photos={a.photos ?? []}
          products={a.products ?? []}
          shopUrl={a.shopUrl}
          printUrl={a.printFiles?.light ?? a.previewUrl}
        />
      ) : null}

      {a.assets ? null : a.content ? (
        <div className="mt-6 divide-y divide-[var(--nw-line)] border-y border-[var(--nw-line)]">
          <section className="py-5">
            <p className="nw-kicker">Instagram</p>
            <p className="mt-2 whitespace-pre-line text-[14.5px] text-[var(--nw-ink)]">{a.content.instagram.caption}</p>
            <p className="mt-2 text-[13px] text-[var(--nw-muted)] [overflow-wrap:anywhere]">{a.content.instagram.hashtags.map((h) => `#${h}`).join(" ")}</p>
          </section>
          <section className="py-5">
            <p className="nw-kicker">Facebook</p>
            <p className="mt-2 whitespace-pre-line text-[14.5px] text-[var(--nw-ink)] [overflow-wrap:anywhere]">{a.content.facebook.post}</p>
          </section>
          <section className="py-5">
            <p className="nw-kicker">Nyhetsbrev</p>
            <p className="mt-2 text-[14.5px] font-medium text-[var(--nw-ink)]">{a.content.newsletter.subject}</p>
            <p className="mt-1 whitespace-pre-line text-[14px] text-[var(--nw-muted)] [overflow-wrap:anywhere]">{a.content.newsletter.body}</p>
          </section>
        </div>
      ) : !a.previewUrl && !a.products?.length ? (
        <p className="mt-6 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-5 text-[14px] text-[var(--nw-muted)]">
          Tryckfilen ligger hos Designagenten. Godkänn så skickas den till New Wave via API.
        </p>
      ) : null}

      {zip && !a.weekly ? (
        <div className="mt-6 flex flex-col gap-3 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[14px] text-[var(--nw-muted)]">Alla bilder och texter i mappar per kanal, med en guide för vad som ska upp var. Inget publiceras automatiskt.</p>
          <ZipButton pack={zip} />
        </div>
      ) : null}

      <ApprovalActions
        clubId={ASA_IF.id}
        id={a.id}
        status={a.status}
        note={a.note}
        shopCount={a.shopProducts?.length ?? 0}
        weekly={Boolean(a.weekly)}
        delivery={delivery}
      />
    </div>
  );
}
