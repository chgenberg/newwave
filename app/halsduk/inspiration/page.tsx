import type { Metadata } from "next";
import { ScarfBank } from "@/components/ScarfBank";
import { CLUBS } from "@/lib/club";
import { SCARF_BANK } from "@/lib/scarfBank";
import { SCARF_DEMO } from "@/lib/scarfDemo";

export const metadata: Metadata = { title: "Inspirationsbanken – stickade halsdukar för idrottsföreningar" };

/** Sporten för demokörningens föreningar; orten kommer ur klubbens profil. */
const DEMO_SPORT: Record<string, string> = { "ifk-goteborg": "Fotboll", "asa-if": "Fotboll" };

export default function ScarfBankPage() {
  // Bara idrott i banken.
  const bank = SCARF_BANK.scarves.filter((s) => s.club.group === "idrott");
  const places = Object.fromEntries([...new Set(SCARF_DEMO.scarves.map((s) => s.clubId))].map((id) => [id, { sport: DEMO_SPORT[id] ?? "", city: CLUBS[id]?.city ?? "" }]));
  return <ScarfBank bank={bank} demo={SCARF_DEMO.scarves} places={places} />;
}
