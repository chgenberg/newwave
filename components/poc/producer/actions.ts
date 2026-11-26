"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { isProducer, PocError, setJobStatus } from "@/lib/poc/orders";
import { getJob, type JobView } from "@/lib/poc/store";
import type { JobStatus, Producer } from "@/lib/poc/types";
import { dropProducerAccess, hasProducerAccess, loginPath } from "./access";
import { isCancelled } from "./data";
import { CAN_REPORT, NEXT_STEP, NOTE_MAX, TRACKING_MAX } from "./steps";

/** Knapparna i stickeriets och tryckeriets kö. Varje anrop kontrollerar producentens inloggning på nytt. */

export type StepState = { error?: string; done?: boolean };

/** Producenten ur formuläret och jobbet, om producenten är inloggad och jobbet är dess eget. */
async function ownJob(form: FormData): Promise<{ producer: Producer; job: JobView } | { error: string }> {
  const producer = String(form.get("producer") ?? "");
  if (!isProducer(producer) || !(await hasProducerAccess(producer))) return { error: "Du är utloggad. Ladda om sidan och logga in igen." };
  const job = await getJob(String(form.get("jobId") ?? ""));
  if (!job || job.producer !== producer) return { error: "Jobbet finns inte." };
  if (isCancelled(job)) {
    refresh();
    return { error: "Ordern är avbruten – jobbet ska inte tillverkas." };
  }
  return { producer, job };
}

async function save(producer: Producer, jobId: string, input: { status: JobStatus; note?: string; tracking?: string }): Promise<StepState> {
  try {
    await setJobStatus(producer, jobId, input);
  } catch (e) {
    if (!(e instanceof PocError)) console.error("[producent] statusen kunde inte sparas", e);
    return { error: e instanceof PocError ? e.message : "Statusen kunde inte sparas. Försök igen." };
  }
  refresh();
  return { done: true };
}

/** Nästa steg: acceptera, starta produktionen, skicka med spårningsnummer, eller ta upp ett jobb med problem igen. */
export async function advanceJob(_prev: StepState, form: FormData): Promise<StepState> {
  const own = await ownJob(form);
  if ("error" in own) return own;
  const { producer, job } = own;
  const step = NEXT_STEP[job.status];
  if (!step || step.status !== form.get("status")) {
    refresh();
    return { error: "Jobbet har redan flyttats – kön är uppdaterad." };
  }
  const tracking = String(form.get("tracking") ?? "").trim().slice(0, TRACKING_MAX);
  if (step.status === "skickad" && !tracking) return { error: "Skriv spårningsnumret." };
  return save(producer, job.id, { status: step.status, tracking: step.status === "skickad" ? tracking : undefined });
}

/** Rapportera ett problem: jobbet får status "fel" med producentens beskrivning. Kunden ser bara att det är försenat. */
export async function reportProblem(_prev: StepState, form: FormData): Promise<StepState> {
  const own = await ownJob(form);
  if ("error" in own) return own;
  const { producer, job } = own;
  const note = String(form.get("note") ?? "").trim().slice(0, NOTE_MAX);
  if (!note) return { error: "Skriv vad som är fel." };
  if (!CAN_REPORT.includes(job.status)) {
    refresh();
    return { error: job.status === "fel" ? "Problemet är redan rapporterat." : "Jobbet är redan skickat." };
  }
  return save(producer, job.id, { status: "fel", note });
}

export async function leaveQueue(form: FormData) {
  const producer = String(form.get("producer") ?? "");
  if (!isProducer(producer)) redirect("/producent");
  await dropProducerAccess(producer);
  redirect(loginPath(producer));
}
