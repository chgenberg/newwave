import Link from "next/link";
import { LogoMark } from "@/components/newwave/Logo";
import { PORTALS } from "@/lib/newwave/hub";

const SHOPS = [
  { href: "/newwave/s/vastkust-profil", label: "Västkust Profil" },
  { href: "/newwave/s/norrsken-reklam", label: "Norrsken Reklam" },
];

export function HubFooter() {
  return (
    <footer className="mt-auto bg-[#141416] text-white">
      <div className="nw-container pb-8 pt-16 sm:pt-20">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <LogoMark size={40} />
            <p className="mt-6 max-w-sm text-[clamp(24px,2.6vw,32px)] font-semibold leading-[1.1] tracking-[-0.035em]">Klubbar, Craft, New Wave och återförsäljare i samma hub.</p>
          </div>
          <FooterList title="Ingångar" links={PORTALS.map((p) => ({ href: p.href, label: p.title }))} />
          <FooterList title="Webbshoppar" links={SHOPS} />
        </div>
        <div className="nw-mono mt-16 flex flex-col gap-2 border-t border-white/12 pt-6 text-[12px] uppercase tracking-[0.06em] text-white/45 sm:flex-row sm:justify-between">
          <span>© 2026 Next Wave Production</span>
          <span>Allt skickas till New Wave via API</span>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="nw-mono text-[12px] uppercase tracking-[0.06em] text-white/45">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="nw-link text-[15px] text-white/80 transition-colors hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HubFooterSlim() {
  return (
    <footer>
      <div className="nw-mono mx-auto flex w-full max-w-[1680px] flex-col gap-2 px-3 py-6 text-[12px] uppercase tracking-[0.06em] text-[var(--nw-muted)] sm:flex-row sm:items-center sm:justify-between">
        <Link href="/newwave" className="nw-link nw-hit">
          Next Wave Production
        </Link>
        <span>Allt skickas till New Wave via API</span>
      </div>
    </footer>
  );
}
