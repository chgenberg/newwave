/* eslint-disable @next/next/no-img-element */
import { type Saved, type SaveTarget, StudioButton } from "@/components/newwave/studio/StudioButton";
import type { Customized } from "@/lib/newwave/marking";

export type MerchItem = { id: string; name: string; priceSek: number; mockupUrl: string; printUrl?: string; custom?: Omit<Customized, "mockupUrl"> };

/**
 * Tryckfilen och produkterna som läggs i butiken. Ett klick på en produkt öppnar designstudion;
 * med `target` sparas ändringen på servern, med `onSaved` hos komponenten runt omkring.
 */
export function MerchGrid({
  title,
  printUrl,
  art,
  products,
  target,
  onSaved,
}: {
  title: string;
  printUrl?: string;
  /** Motivet i ljust och mörkt utförande; annars produktens egen tryckfil. */
  art?: { light: string; dark: string };
  products: MerchItem[];
  target?: Extract<SaveTarget, { kind: "approval" }>;
  onSaved?: (productId: string, s: Saved) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {printUrl ? (
        <figure className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-3">
          <img src={printUrl} alt={`Tryckfil ${title}`} className="aspect-[3/4] w-full rounded-xl bg-white object-contain" />
          <figcaption className="mt-2 truncate text-[12.5px] text-[var(--nw-muted)]">Tryckfil · 300 dpi</figcaption>
        </figure>
      ) : null}
      {products.map((p) => (
        <figure key={p.id} className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-3">
          <StudioButton
            productId={p.id}
            art={{ light: art?.light ?? p.printUrl ?? printUrl ?? null, dark: art?.dark ?? p.printUrl ?? printUrl ?? null, label: "klubbens motiv" }}
            initial={p.custom?.design}
            color={p.custom?.color}
            target={target}
            onSaved={onSaved && ((s) => onSaved(p.id, s))}
            className="group relative block w-full overflow-hidden rounded-xl bg-white text-left focus-visible:outline-2 focus-visible:outline-[var(--club)]"
          >
            <img src={p.mockupUrl} alt={`${title} på ${p.name}`} className="aspect-[3/4] w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
          </StudioButton>
          <figcaption className="mt-2 truncate text-[12.5px] text-[var(--nw-muted)]">
            {p.name} · {p.priceSek} kr{p.custom ? " · anpassad" : ""}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
