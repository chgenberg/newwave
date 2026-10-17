import type { Metadata } from "next";
import { ShopBuilder } from "@/components/newwave/shop/ShopBuilder";
import { BUILDER_STEPS, stepsDone, type BuilderStep } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller } from "@/lib/newwave/shopState";
import { workspaceId } from "@/lib/newwave/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Redigera butiken · Återförsäljarens dashboard" };

export default async function RedigeraButiken({ searchParams }: { searchParams: Promise<{ flik?: string }> }) {
  const [{ flik }, reseller, ws] = await Promise.all([searchParams, getReseller(CURRENT_RESELLER), workspaceId()]);
  if (!reseller) return null;
  const done = stepsDone(reseller);
  const asked = BUILDER_STEPS.find((s) => s.id === flik)?.id;
  const first: BuilderStep = asked ?? BUILDER_STEPS.find((s) => !done[s.id])?.id ?? "varumarke";
  return <ShopBuilder initial={reseller} initialStep={first} ws={ws} />;
}
