import type { Metadata } from "next";
import { ShopBuilder } from "@/components/newwave/shop/ShopBuilder";
import { BUILDER_STEPS, stepsDone, type BuilderStep } from "@/lib/newwave/reseller";
import { CURRENT_RESELLER, getReseller } from "@/lib/newwave/shopState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Butiken · Återförsäljarens dashboard" };

export default async function Butiken({ searchParams }: { searchParams: Promise<{ steg?: string }> }) {
  const [{ steg }, reseller] = await Promise.all([searchParams, getReseller(CURRENT_RESELLER)]);
  if (!reseller) return null;
  const done = stepsDone(reseller);
  const asked = BUILDER_STEPS.find((s) => s.id === steg)?.id;
  const first: BuilderStep = asked ?? BUILDER_STEPS.find((s) => !done[s.id])?.id ?? "varumarke";
  return <ShopBuilder initial={reseller} initialStep={first} />;
}
