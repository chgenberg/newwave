import { redirect } from "next/navigation";
import { isOccasion } from "@/lib/newwave/occasions";

/** Gamla länkar till eventverktyget går till tillfällets sida, eller till eventen på startsidan. */
export default async function ShopEvent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tillfalle?: string }> }) {
  const [{ slug }, { tillfalle }] = await Promise.all([params, searchParams]);
  redirect(isOccasion(tillfalle) ? `/newwave/s/${slug}/event/${tillfalle}` : `/newwave/s/${slug}#event`);
}
