import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalView } from "@/components/demo/ApprovalView";
import { readShare } from "@/lib/demoShare";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Godkänn offert", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const share = await readShare((await params).id);
  if (!share) notFound();
  return <ApprovalView initial={share} />;
}
