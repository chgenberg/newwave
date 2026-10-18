import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/newwave/LoginForm";
import { LogoMark } from "@/components/newwave/Logo";
import { ACCESS_COOKIE, accessToken, safeNext } from "@/lib/access";
import { HERO_VIDEO } from "@/lib/newwave/hub";

export const metadata: Metadata = { title: "Logga in · Next Wave Production", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ till?: string }> }) {
  const next = safeNext((await searchParams).till);
  const password = process.env.DEMO_PASSWORD;
  if (!password || (await cookies()).get(ACCESS_COOKIE)?.value === (await accessToken(password))) redirect(next);

  return (
    <main className="relative grid min-h-[100svh] place-items-center overflow-hidden bg-[#141416] px-4 py-10 text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO_VIDEO.poster} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#141416_75%)]" />
      <section className="nw-pop relative w-full max-w-[420px] rounded-[30px] bg-white p-7 text-[#111] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] sm:p-9">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="text-[13px] font-semibold tracking-[0.18em]">NEXT WAVE</span>
        </div>
        <h1 className="mt-8 text-[30px] font-semibold leading-[1.05] tracking-[-0.04em]">Välkommen</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6F6B63]">Demot är privat. Ange lösenordet du fått för att se filmen och prova själv.</p>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
