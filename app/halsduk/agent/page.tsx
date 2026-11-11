import type { Metadata } from "next";
import { preload } from "react-dom";
import { ScarfAgent } from "@/components/ScarfAgent";

export const metadata: Metadata = { title: "Halsduksagenten – från signal till stickfil" };

export default function ScarfAgentPage() {
  // 3D-modellen börjar hämtas med sidan, i stället för först när 3D-koden har laddats.
  preload("/halsduk/halsduk.glb", { as: "fetch", crossOrigin: "anonymous" });
  return <ScarfAgent />;
}
