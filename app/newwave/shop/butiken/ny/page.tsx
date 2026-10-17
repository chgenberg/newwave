import type { Metadata } from "next";
import { QuickBuild } from "@/components/newwave/shop/QuickBuild";
import { EXAMPLE_SITES } from "@/lib/newwave/resellerImport";
import { CURRENT_RESELLER, getReseller } from "@/lib/newwave/shopState";
import { workspaceId } from "@/lib/newwave/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bygg butiken · Återförsäljarens dashboard" };

export default async function NyButik() {
  const [reseller, ws] = await Promise.all([getReseller(CURRENT_RESELLER), workspaceId()]);
  if (!reseller) return null;
  return <QuickBuild initial={reseller} examples={EXAMPLE_SITES.map(({ host, label }) => ({ host, label }))} ws={ws} />;
}
