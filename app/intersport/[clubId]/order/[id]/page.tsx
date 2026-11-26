import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/poc/shop/AutoRefresh";
import { OrderStatusView } from "@/components/poc/shop/OrderStatus";
import { intersportClub, intersportPath } from "@/lib/intersport";
import { orderForCustomer } from "@/lib/poc/orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Din order · Intersport" };

type Props = { params: Promise<{ clubId: string; id: string }>; searchParams: Promise<{ t?: string | string[] }> };

/** Kundens statussida. Nyckeln i `t` kommer från tacksidan; utan rätt nyckel finns ordern inte. */
export default async function CustomerOrder({ params, searchParams }: Props) {
  const [{ clubId, id }, { t }] = await Promise.all([params, searchParams]);
  const token = typeof t === "string" ? t : "";
  const club = await intersportClub(clubId);
  if (!club || !token) notFound();
  const order = await orderForCustomer(id, token).catch((e) => {
    console.error("[klubbshop] ordern kunde inte läsas", e);
    return null;
  });
  if (!order || order.clubId !== clubId) notFound();
  const open = order.status !== "skickad" && order.status !== "avbruten";
  return (
    <>
      {open ? <AutoRefresh /> : null}
      <OrderStatusView order={order} clubName={club.name} home={intersportPath(clubId)} />
    </>
  );
}
