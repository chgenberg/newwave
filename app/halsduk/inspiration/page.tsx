import type { Metadata } from "next";
import { ScarfBank } from "@/components/ScarfBank";
import { CLUBS } from "@/lib/club";
import { SCARF_BANK } from "@/lib/scarfBank";
import { SCARF_DEMO } from "@/lib/scarfDemo";

export const metadata: Metadata = { title: "Inspirationsbanken – stickade halsdukar för idrottsföreningar" };

export default function ScarfBankPage() {
  // Bara idrott i banken. Demokörningens föreningar får orten ur klubbens profil.
  const bank = SCARF_BANK.scarves.filter((s) => s.club.group === "idrott");
  const places = Object.fromEntries([...new Set(SCARF_DEMO.scarves.map((s) => s.clubId))].map((id) => [id, CLUBS[id]?.city ?? ""]));
  return <ScarfBank bank={bank} demo={SCARF_DEMO.scarves} places={places} />;
}
