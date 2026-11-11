import type { Metadata } from "next";
import { ScarfAgent } from "@/components/ScarfAgent";
import { SCARF_DEMO } from "@/lib/scarfDemo";

export const metadata: Metadata = { title: "Halsduksagenten – från signal till stickfil" };

export default function ScarfAgentPage() {
  return <ScarfAgent demo={SCARF_DEMO} />;
}
