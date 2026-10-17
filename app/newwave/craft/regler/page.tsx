import type { Metadata } from "next";
import { RulesEditor } from "@/components/newwave/craft/RulesEditor";
import { CRAFT_CLUBS } from "@/lib/newwave/craft";
import { DEFAULT_RULES, readState } from "@/lib/newwave/craftState";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Craft · Regler" };

const fmt = (at: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(at));

export default async function CraftRulesPage() {
  const state = await readState();
  const changes = state.log.filter((l) => l.kind === "regler").slice(0, 4);

  return (
    <div className="nw-page">
      <h1 className="nw-club-heading text-[26px] leading-tight text-[var(--club)] sm:text-[30px]">Regler</h1>
      <p className="mt-1 text-[14.5px] text-[var(--nw-muted)]">Crafts gemensamma riktlinjer. Varje klubbagent följer dem utöver klubbens egna färger och ton.</p>
      {changes.length ? (
        <details className="group mt-3 text-[12.5px] text-[var(--nw-muted)]">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-[var(--nw-ink)] [&::-webkit-details-marker]:hidden">
            Senast ändrat {fmt(changes[0].at)}
            <span className="underline underline-offset-4">· historik</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {changes.map((c) => (
              <li key={c.id}>
                {fmt(c.at)} · {c.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-6">
        <RulesEditor key={JSON.stringify(state.rules ?? null)} initial={state.rules ?? DEFAULT_RULES} clubs={CRAFT_CLUBS.length} />
      </div>
    </div>
  );
}
