"use client";

import { useActionState } from "react";
import { findOrder } from "./actions";

/** Formuläret där kunden slår upp sin order med ordernummer och e-post. */
export function FindOrder() {
  const [state, action, pending] = useActionState(findOrder, {});
  return (
    <form action={action} className="mt-8 grid gap-3">
      <label className="grid gap-1 text-[12.5px] text-[#6F6B63]">
        Ordernummer
        <input name="number" required defaultValue={state.number} placeholder="IS-100123" autoComplete="off" spellCheck={false} className="h-12 rounded-xl border border-[#DCDAD4] px-3 font-mono text-[15px] uppercase text-[#111] outline-none placeholder:normal-case focus:border-[#111]" />
      </label>
      <label className="grid gap-1 text-[12.5px] text-[#6F6B63]">
        E-post
        <input name="email" type="email" required defaultValue={state.email} autoComplete="email" className="h-12 rounded-xl border border-[#DCDAD4] px-3 text-[15px] text-[#111] outline-none focus:border-[#111]" />
      </label>
      {state.error ? (
        <p role="alert" className="text-[13.5px] text-[#B42318]">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="mt-1 h-12 rounded-full bg-[var(--shop)] text-[15px] font-semibold text-[var(--shop-on)] transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Söker …" : "Visa ordern"}
      </button>
    </form>
  );
}
