"use client";

import { useActionState, useState } from "react";
import type { Role } from "@/lib/poc/types";
import { loginAction } from "./actions";

/** Formuläret: rollen (förvald ur adressen), lösenordet och sidan att komma tillbaka till. */
export function LoginForm({ roles, initial, next }: { roles: { id: Role; name: string; label: string }[]; initial: Role; next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  const [role, setRole] = useState<Role>(initial);
  const current = roles.find((r) => r.id === role) ?? roles[0];
  return (
    <form action={action}>
      <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em]">Logga in som {current.name}</h1>
      <input type="hidden" name="next" value={next} />
      <fieldset className="mt-6">
        <legend className="text-[13px] font-semibold text-[#6F6B63]">Vem är du?</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-2xl bg-[#F4F4F2] p-1">
          {roles.map((r) => (
            <label key={r.id} className={`cursor-pointer rounded-xl py-2.5 text-center text-[14px] font-medium transition ${r.id === role ? "bg-white text-[#111] shadow-sm" : "text-[#6F6B63] hover:text-[#111]"}`}>
              <input type="radio" name="roll" value={r.id} checked={r.id === role} onChange={() => setRole(r.id)} className="sr-only" />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="poc-password" className="mt-5 block text-[13px] font-semibold text-[#6F6B63]">
        Lösenord
      </label>
      <input
        id="poc-password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        aria-invalid={Boolean(state?.error)}
        aria-describedby={state?.error ? "poc-password-error" : undefined}
        className={`mt-1.5 h-14 w-full rounded-2xl bg-[#F4F4F2] px-4 text-[17px] outline-none transition focus:bg-white focus:shadow-[inset_0_0_0_2px_#111] ${state?.error ? "shadow-[inset_0_0_0_2px_#B42318]" : ""}`}
      />
      {state?.error ? (
        <p id="poc-password-error" role="alert" className="mt-2 text-[13.5px] text-[#B42318]">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-[#111] text-[16px] font-semibold text-white transition hover:bg-[#2B2D31] disabled:opacity-70">
        {pending ? "Kontrollerar…" : "Logga in"}
      </button>
    </form>
  );
}
