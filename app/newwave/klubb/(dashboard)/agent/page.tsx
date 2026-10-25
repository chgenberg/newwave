import type { Metadata } from "next";
import { ClubAgent } from "@/components/newwave/agent/ClubAgent";
import { ASA_IF as CLUB } from "@/lib/club";
import { ASA_IF } from "@/lib/newwave/club";
import { agentOpener, agentShop } from "@/lib/newwave/klubbagent";
import { genitive } from "@/lib/newwave/newsletterHtml";
import { readBrand } from "@/lib/newwave/store";
import { clubTheme } from "@/lib/newwave/theme";

export const metadata: Metadata = { title: `${ASA_IF.name} · Agenten` };
export const dynamic = "force-dynamic";

const SAMPLES = [
  { src: "/newwave/clubs/asa-if/agent/mal.jpg", label: "målgest" },
  { src: "/newwave/clubs/asa-if/agent/lag.jpg", label: "lagbild" },
  { src: "/newwave/clubs/asa-if/agent/pingis.jpg", label: "pingis" },
];

export default async function AgentPage() {
  const [shop, saved] = await Promise.all([agentShop(ASA_IF.id), readBrand(ASA_IF.id)]);
  const theme = clubTheme(saved.palette ?? CLUB.palette);
  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Agenten i mobilen</h1>
      <p className="mt-1 max-w-[62ch] text-[14.5px] text-[var(--nw-muted)]">
        Klubbens egen agent, som en chatt i WhatsApp. Skriv vad som hänt eller skicka en bild – agenten gör inlägget i {genitive(ASA_IF.name)} färger, föreslår när det ska ut och tipsar om varor i shoppen.
      </p>
      <div className="mt-6">
        <ClubAgent
          clubId={ASA_IF.id}
          look={{ name: ASA_IF.name, handle: ASA_IF.handle, site: ASA_IF.website.replace(/^https?:\/\/(www\.)?/, ""), crest: `/api/v1/brand/${ASA_IF.id}/skold-farg.png`, primary: theme.primary, accent: theme.accent, onAccent: theme.onAccent }}
          shop={shop}
          opener={agentOpener(CLUB)}
          samples={SAMPLES}
        />
      </div>
    </div>
  );
}
