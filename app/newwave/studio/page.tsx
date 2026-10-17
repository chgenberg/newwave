import type { Metadata } from "next";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { Workspace } from "@/components/newwave/workspace/Workspace";

export const metadata: Metadata = { title: "Designmotorn · Next Wave" };

export default function StudioPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto w-full max-w-[1680px]">
        <Workspace role={{ kind: "studio" }} />
      </div>
      <HubFooterSlim />
    </main>
  );
}
