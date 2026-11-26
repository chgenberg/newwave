"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Publicera nu" och "Ta bort" för en plan som inte publicerats. */
export function PlanActions({ id, canRun, canDelete }: { id: string; canRun: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "run" | "delete">("");
  const [error, setError] = useState("");
  if (!canRun && !canDelete) return null;

  const call = async (kind: "run" | "delete") => {
    setBusy(kind);
    setError("");
    try {
      const res = await fetch(kind === "run" ? `/api/v1/craft/sasong/${id}/publicera` : `/api/v1/craft/sasong/${id}`, { method: kind === "run" ? "POST" : "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; plan?: { error?: string } };
      if (!res.ok) throw new Error(json.error ?? json.plan?.error ?? "Något gick fel.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel.");
      router.refresh();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canRun ? (
          <button type="button" disabled={!!busy} onClick={() => call("run")} className="nw-btn h-9 px-3.5 text-[13px] disabled:opacity-50">
            {busy === "run" ? "Publicerar…" : "Publicera nu"}
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" disabled={!!busy} onClick={() => call("delete")} className="nw-btn nw-btn-ghost h-9 px-3.5 text-[13px] disabled:opacity-50">
            {busy === "delete" ? "Tar bort…" : "Ta bort"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[12.5px] text-[#9B1C1C]">{error}</p> : null}
    </div>
  );
}
