import type { Metadata } from "next";
import { Confirmation } from "@/components/newwave/sportshop/Confirmation";
import { DICT } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${DICT[await shopLang()].done.title} · Sport Lindner` };
}

export default function OrderPage() {
  return (
    <section className="mx-auto max-w-[1320px] px-4 pt-8 sm:px-6">
      <Confirmation />
    </section>
  );
}
