import type { Metadata } from "next";
import { Footer } from "@/components/newwave/sportshop/Footer";
import { Header } from "@/components/newwave/sportshop/Header";
import { LangProvider } from "@/components/newwave/sportshop/Lang";
import { DICT } from "@/lib/newwave/sportshop/i18n";
import { shopLang } from "@/lib/newwave/sportshop/lang";

export async function generateMetadata(): Promise<Metadata> {
  const t = DICT[await shopLang()];
  return { title: t.meta.title, description: t.meta.description };
}

export default async function SportshopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await shopLang();
  return (
    <LangProvider lang={lang}>
      <div lang={lang} className="flex min-h-screen flex-col bg-[#FAFAF8] text-[#111]">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </LangProvider>
  );
}
