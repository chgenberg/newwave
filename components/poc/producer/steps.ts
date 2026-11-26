import type { JobStatus } from "@/lib/poc/types";

/** Jobbets status i kön och nästa steg, med knappens text. Skickad är slutläget; från fel tas jobbet upp igen. */

export const JOB_LABEL: Record<JobStatus, string> = { ny: "Ny", accepterad: "Accepterad", "i produktion": "I produktion", skickad: "Skickad", fel: "Problem" };

export const NEXT_STEP: Partial<Record<JobStatus, { status: JobStatus; label: string }>> = {
  ny: { status: "accepterad", label: "Acceptera" },
  accepterad: { status: "i produktion", label: "Starta produktion" },
  "i produktion": { status: "skickad", label: "Markera som skickad" },
  // Jobbet tas upp igen som accepterat; produktionen startas sedan på nytt med nästa knapp.
  fel: { status: "accepterad", label: "Ta upp igen" },
};

/** Ett problem kan rapporteras så länge jobbet inte är skickat. */
export const CAN_REPORT: JobStatus[] = ["ny", "accepterad", "i produktion"];

export const TRACKING_MAX = 60;
/** Samma gräns som kärnan har för anteckningen. */
export const NOTE_MAX = 500;
