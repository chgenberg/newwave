import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Producenter" };

/** Ingången till stickeriets och tryckeriets köer; varje kö kräver producentens inloggning. */
export default function Producers() {
  return (
    <div className="mx-auto max-w-[400px] px-4 pt-24">
      <h1 className="text-[28px] font-bold tracking-[-0.01em]">Producenter</h1>
      <p className="mt-1 text-[14px] text-[#555]">Produktionsköerna. Logga in med producentens lösenord.</p>
      <ul className="mt-6 grid gap-2">
        {[
          ["stickeri", "Stickeriet", "Halsdukar"],
          ["tryckeri", "Tryckeriet", "Plagg"],
        ].map(([id, name, what]) => (
          <li key={id}>
            <Link href={`/producent/${id}`} className="flex items-center justify-between rounded-lg border border-[#E2E2E2] px-4 py-3 hover:border-[#111]">
              <span className="font-semibold">{name}</span>
              <span className="text-[13px] text-[#777]">{what} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
