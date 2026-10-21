import Link from "next/link";

/** Brödsmulor överst på undersidorna; sista steget är sidan man står på. */
export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-[1320px] px-4 pt-5 sm:px-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#6F6B63]">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i ? <span aria-hidden>/</span> : null}
            {c.href ? (
              <Link href={c.href} className="underline-offset-2 hover:text-[#111] hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-[#111]">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
