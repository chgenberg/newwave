import Link from "next/link";
import { HubFooterSlim } from "@/components/newwave/HubFooter";
import { LogoMark } from "@/components/newwave/Logo";
import { shopPath } from "@/lib/newwave/clubShop";

const TABS = [
  { id: "dashboard", label: "Dashboard", href: (id: string) => `/newwave/klubbar/${id}/dashboard` },
  { id: "ordmarken", label: "Wordmarks", href: (id: string) => `/newwave/klubbar/${id}` },
] as const;

/**
 * Klubbens egna sidor: dashboarden och förhandsvisningen av wordmarken. Klubben själv kommer via sin länk utan
 * demolösenordet; då leder loggan inte in i demot.
 */
export function ClubPortal({ id, active, insider, action, children }: { id: string; active: (typeof TABS)[number]["id"]; insider: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  const brand = (
    <>
      <LogoMark size={28} />
      <span className="hidden text-[13px] font-semibold tracking-[0.18em] sm:inline">NEXT WAVE</span>
    </>
  );
  return (
    <div className="flex min-h-screen flex-col bg-[#E9E9E5] p-2 min-[900px]:p-6 min-[900px]:pb-0">
      <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col overflow-clip rounded-[26px] bg-white shadow-[0_1px_2px_rgba(17,17,17,0.06),0_40px_90px_-50px_rgba(17,17,17,0.45)] min-[900px]:rounded-[30px]">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[rgba(17,17,17,0.07)] bg-white/90 px-3 py-3 backdrop-blur-xl min-[420px]:gap-3 min-[900px]:px-6">
          {insider ? (
            <Link href="/newwave/start" className="flex min-h-9 shrink-0 items-center gap-2.5" aria-label="Next Wave">
              {brand}
            </Link>
          ) : (
            <span className="flex min-h-9 shrink-0 items-center gap-2.5" aria-label="Next Wave">
              {brand}
            </span>
          )}
          <nav aria-label="Klubbens sidor" className="flex min-w-0 items-center gap-1 rounded-full bg-[#F2F1EE] p-1">
            {TABS.map((t) => (
              <Link key={t.id} href={t.href(id)} aria-current={t.id === active ? "page" : undefined} className={`inline-flex h-8 items-center rounded-full px-3 text-[13.5px] font-medium transition ${t.id === active ? "bg-white shadow-[0_1px_2px_rgba(17,17,17,0.12)]" : "text-[#6F6B63] hover:text-[#111]"}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href={shopPath(id)} className="hidden h-10 items-center rounded-full border border-[rgba(17,17,17,0.15)] px-4 text-[13.5px] font-medium transition hover:border-[#111] min-[560px]:inline-flex">
              Butiken
            </Link>
            {action}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-14 pt-8 min-[900px]:px-10">{children}</main>
      </div>
      <HubFooterSlim />
    </div>
  );
}
