"use client";

import { useActionState, useState } from "react";
import { type HubActionState, resendToHubAction } from "@/app/newwave/craft/ordrar/actions";
import { cancelOrderAction, type OrderActionState } from "./actions";

/**
 * Crafts åtgärder på en order: skicka den till affärssystemet igen (genom utkorgen mot New Waves hubb) när det inte
 * bekräftat ordern, och avbryta ordern med en orsak så länge inget jobb börjat tillverkas. Knapparna visas bara när
 * åtgärden är tillåten.
 */
export function OrderActions({ orderId, canCancel, canRetry }: { orderId: string; canCancel: boolean; canRetry: boolean }) {
  const [asking, setAsking] = useState(false);
  const [retry, retryAction, retrying] = useActionState<HubActionState, FormData>(resendToHubAction, {});
  const [cancel, cancelAction, cancelling] = useActionState<OrderActionState, FormData>(cancelOrderAction, {});
  const message = [cancel, retry].find((s) => s.error || s.done);
  if (!canCancel && !canRetry && !message) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {canRetry || (canCancel && !asking) ? (
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <form action={retryAction}>
              <input type="hidden" name="orderId" value={orderId} />
              <button type="submit" disabled={retrying} className="nw-btn disabled:opacity-50">
                {retrying ? "Skickar…" : "Skicka till affärssystemet igen"}
              </button>
            </form>
          ) : null}
          {canCancel && !asking ? (
            <button type="button" onClick={() => setAsking(true)} className="nw-btn nw-btn-ghost">
              Avbryt order
            </button>
          ) : null}
        </div>
      ) : null}
      {canCancel && asking ? (
        <form action={cancelAction} className="flex max-w-[560px] flex-col gap-2 rounded-[22px] border border-[var(--nw-line)] p-3 sm:p-4">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="text-[13.5px] font-medium text-[var(--nw-ink)]" htmlFor="cancel-reason">
            Varför avbryts ordern?
          </label>
          <input id="cancel-reason" name="reason" required maxLength={300} autoFocus placeholder="T.ex. kunden ångrade köpet" className="nw-input h-10" />
          <p className="text-[12.5px] text-[var(--nw-muted)]">Jobben hos tryckeriet och stickeriet stoppas, affärssystemet får en avbokning och kunden ser att ordern är avbruten.</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={cancelling} className="nw-btn bg-[#9B1C1C] disabled:opacity-50">
              {cancelling ? "Avbryter…" : "Avbryt ordern"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="nw-btn nw-btn-ghost">
              Behåll ordern
            </button>
          </div>
        </form>
      ) : null}
      {message ? (
        <p role="status" className={`text-[13px] ${message.error ? "text-[#9B1C1C]" : "text-[#1E6B34]"}`}>
          {message.error ?? message.done}
        </p>
      ) : null}
    </div>
  );
}
