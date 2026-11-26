import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { queuePath, requireProducer } from "@/components/poc/producer/access";
import { queueView } from "@/components/poc/producer/data";
import { Queue } from "@/components/poc/producer/Queue";
import { isProducer, PRODUCER_NAME } from "@/lib/poc/orders";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ producer: string }>; searchParams: Promise<{ nyckel?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { producer } = await params;
  return { title: isProducer(producer) ? `${PRODUCER_NAME[producer].The} · produktionskö` : "Producent" };
}

/** Stickeriets och tryckeriets kö (/producent/stickeri, /producent/tryckeri). Producenten loggar in med sitt lösenord. */
export default async function ProducerQueue({ params, searchParams }: Props) {
  const [{ producer }, sp] = await Promise.all([params, searchParams]);
  if (!isProducer(producer)) notFound();
  // Gamla länkar med demonyckeln i URL:en leder till kön utan nyckeln; inloggningen sker nu med lösenord.
  if (sp.nyckel !== undefined) redirect(queuePath(producer));
  await requireProducer(producer);
  return <Queue producer={producer} name={PRODUCER_NAME[producer].The} queue={await queueView(producer)} now={now()} />;
}

const now = () => Date.now();
