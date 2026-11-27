"use client";

import { useActionState } from "react";
import { runHubAction, type RunHubState } from "./actions";

/** "Kör nu": skickar det som är på tur i utkorgen direkt, i stället för att vänta på schemat. */
export function RunHubButton({ disabled }: { disabled?: boolean }) {
  const [state, action, running] = useActionState<RunHubState>(runHubAction, {});
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <form action={action}>
        <button type="submit" disabled={running || disabled} className="nw-btn disabled:opacity-50">
          {running ? "Kör…" : "Kör nu"}
        </button>
      </form>
      {state.error || state.done ? (
        <p role="status" className={`max-w-[46ch] text-[12.5px] sm:text-right ${state.error ? "text-[#9B1C1C]" : "text-[#1E6B34]"}`}>
          {state.error ?? state.done}
        </p>
      ) : null}
    </div>
  );
}
