import Link from "next/link";

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
