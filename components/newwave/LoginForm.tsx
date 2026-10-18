"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/newwave/las/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-7">
      <input type="hidden" name="till" value={next} />
      <label htmlFor="nw-password" className="text-[13px] font-semibold text-[#6F6B63]">
        Lösenord
      </label>
      <div className={`mt-1.5 flex h-14 items-center rounded-2xl bg-[#F4F4F2] pl-4 pr-1.5 transition focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_#111] ${state?.error ? "shadow-[inset_0_0_0_2px_#B42318]" : ""}`}>
        <input
          id="nw-password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={Boolean(state?.error)}
          aria-describedby={state?.error ? "nw-password-error" : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none focus-visible:outline-none!"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="h-10 rounded-xl px-3 text-[13px] font-medium text-[#6F6B63] hover:text-[#111]">
          {show ? "Dölj" : "Visa"}
        </button>
      </div>
      {state?.error ? (
        <p id="nw-password-error" role="alert" className="mt-2 text-[13.5px] text-[#B42318]">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#111] text-[16px] font-semibold text-white transition hover:bg-[#2B2D31] disabled:opacity-70">
        {pending ? "Kontrollerar…" : "Fortsätt"}
        {pending ? null : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </form>
  );
}
