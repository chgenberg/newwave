import { Fragment } from "react";
import { FONTS, type FontId } from "@/lib/newwave/wordmark/fonts";
import type { Made } from "@/lib/newwave/wordmark/schema";

const day = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fontLabel = (id: string) => FONTS[id as FontId]?.label ?? id;

/**
 * Vad AI gjorde med designen, vad som mättes fram utan AI och vad en människa ändrade – och att klubbversionerna ritas
 * utan AI. Står i studion och när designen sparats, så att den som trycker kan svara på vad AI har gjort.
 */
export function Provenance({ made }: { made?: Made }) {
  if (!made) return null;
  const { ai, fonts, likeness, rights } = made;
  const measured = [fonts?.length ? `typsnitten ${fonts.map((f) => `”${f.text}” → ${fontLabel(f.font)} ${f.score} %`).join(", ")}` : "", likeness !== undefined ? `mallen återskapar originalet till ${likeness} %` : ""].filter(Boolean).join(" · ");
  const human = [made.corrected ? "Craft rättade agentens tolkning" : "", made.edited ? `ändrad i designstudion ${day(made.edited)}` : ""].filter(Boolean).join(", ");
  const rows: { label: string; text: string; warn?: boolean }[] = [
    ...(ai
      ? [
          {
            label: "AI",
            text:
              ai.task === "read"
                ? `Läsagenten (${ai.model}) tolkade ${made.file ? `”${made.file}”` : "filen"} ${day(ai.at)} – vad som är namn, märke, dekor och klubbfärger${ai.lessons ? `, med ${ai.lessons} tidigare rättelser som exempel` : ""}${ai.memory ? ". Öppnad ur minnet, utan nytt AI-anrop" : ""}.`
                : `Mallagenten (${ai.model}) föreslog mallen ${day(ai.at)}.`,
          },
        ]
      : []),
    ...(measured ? [{ label: "Mätt utan AI", text: `${measured[0].toUpperCase()}${measured.slice(1)}.` }] : []),
    ...(human ? [{ label: "Människa", text: `${human[0].toUpperCase()}${human.slice(1)}.` }] : []),
    { label: "Klubbarna", text: "Varje klubbversion ritas av mallen utan AI, med klubbens namn, märke och färger från klubbregistret." },
    ...(rights ? [{ label: "Rättigheter", text: `Rätten att använda designen bekräftades ${day(rights.at)}.` }] : []),
    ...(rights?.mark ? [{ label: "Varumärke", text: `Agenten kände igen ${rights.mark} – använd bara stilen, inte märket.`, warn: true }] : []),
  ];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px] leading-snug" data-provenance>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <dt className="font-semibold text-[var(--nw-ink)]">{r.label}</dt>
          <dd className={r.warn ? "text-[#9A5B00]" : "text-[var(--nw-muted)]"}>{r.text}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
