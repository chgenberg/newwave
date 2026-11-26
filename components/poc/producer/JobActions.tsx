"use client";

import { useActionState, useState } from "react";
import type { JobStatus, Producer } from "@/lib/poc/types";
import { advanceJob, reportProblem } from "./actions";
import { CAN_REPORT, NEXT_STEP, NOTE_MAX, TRACKING_MAX } from "./steps";

/**
 * Knapparna för jobbet: nästa steg (Acceptera → Starta produktion → Markera som skickad, med spårningsnumret sist),
 * Rapportera problem med en obligatorisk beskrivning, och Ta upp igen när jobbet har ett problem. Komponenten ska ha
 * jobbets status som `key`, så att formulären börjar om när jobbet flyttas.
 */
export function JobActions({ producer, jobId, status }: { producer: Producer; jobId: string; status: JobStatus }) {
  const [state, action, pending] = useActionState(advanceJob, {});
  const [problem, report, reporting] = useActionState(reportProblem, {});
  const [open, setOpen] = useState(false);
  const step = NEXT_STEP[status];
  const ship = step?.status === "skickad";
  const canReport = CAN_REPORT.includes(status);
  const busy = pending || reporting;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {step ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="producer" value={producer} />
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="status" value={step.status} />
            {ship ? (
              <label className="flex items-center gap-2 text-[13px] text-[#555]">
                Spårningsnummer
                <input name="tracking" required maxLength={TRACKING_MAX} autoComplete="off" spellCheck={false} placeholder="t.ex. 00370712345678901" className="h-9 w-56 rounded-md border border-[#CFCFCF] px-2.5 font-mono text-[13.5px] text-[#111] outline-none focus:border-[#111]" />
              </label>
            ) : null}
            <button type="submit" disabled={busy} className="h-9 rounded-md bg-[#111] px-3.5 text-[13.5px] font-semibold text-white transition hover:bg-[#333] disabled:opacity-50">
              {pending ? "Sparar …" : step.label}
            </button>
          </form>
        ) : null}
        {canReport && !open ? (
          <button type="button" onClick={() => setOpen(true)} disabled={busy} className="h-9 rounded-md px-3 text-[13.5px] text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-50">
            Rapportera problem
          </button>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {state.error}
        </p>
      ) : null}

      {canReport && open ? (
        <form action={report} className="grid gap-2 rounded-md border border-[#F3C5C0] bg-[#FFF8F7] p-3">
          <input type="hidden" name="producer" value={producer} />
          <input type="hidden" name="jobId" value={jobId} />
          <label className="grid gap-1 text-[13px] font-semibold text-[#111]">
            Vad är fel?
            <textarea name="note" required maxLength={NOTE_MAX} rows={2} autoFocus placeholder="t.ex. Garnet i klubbens blå är slut, nytt kommer på fredag" className="rounded-md border border-[#CFCFCF] bg-white px-2.5 py-2 text-[14px] font-normal text-[#111] outline-none focus:border-[#111]" />
          </label>
          <p className="text-[12.5px] text-[#777]">Syns för Craft i ordervyn. Kunden ser bara att ordern är försenad.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="h-9 rounded-md bg-[#B42318] px-3.5 text-[13.5px] font-semibold text-white transition hover:bg-[#912018] disabled:opacity-50">
              {reporting ? "Sparar …" : "Rapportera"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md px-3 text-[13.5px] text-[#555] hover:text-[#111]">
              Avbryt
            </button>
          </div>
          {problem.error ? (
            <p role="alert" className="text-[13px] text-[#B42318]">
              {problem.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
