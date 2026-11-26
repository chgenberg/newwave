import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentRoles, internalPath, isRole, ROLE_NAME, ROLES } from "@/lib/poc/auth";
import { logoutAction } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Logga in · POC-flödet", robots: { index: false } };

const LABEL = { craft: "Craft", stickeri: "Stickeriet", tryckeri: "Tryckeriet" } as const;

/** Inloggningen per roll: `?roll=craft|stickeri|tryckeri&next=<sida>`. Är rollen redan inloggad går man direkt vidare. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ roll?: string; next?: string }> }) {
  const sp = await searchParams;
  const role = isRole(sp.roll) ? sp.roll : "craft";
  const next = internalPath(sp.next) ?? "";
  const roles = await currentRoles();
  if (next && isRole(sp.roll) && roles.includes(role)) redirect(next);

  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#F4F4F2] px-4 py-10 text-[#111]">
      <section className="w-full max-w-[420px] rounded-[30px] bg-white p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)] sm:p-9">
        <LoginForm roles={ROLES.map((id) => ({ id, name: ROLE_NAME[id], label: LABEL[id] }))} initial={role} next={next} />
        {roles.length ? (
          <div className="mt-7 border-t border-[#EDECE8] pt-5">
            <p className="text-[13px] font-semibold text-[#6F6B63]">Inloggad som</p>
            <ul className="mt-2 space-y-1.5">
              {roles.map((r) => (
                <li key={r} className="flex items-center justify-between text-[15px]">
                  {LABEL[r]}
                  <form action={logoutAction}>
                    <input type="hidden" name="roll" value={r} />
                    <input type="hidden" name="next" value={`/logga-in?roll=${r}`} />
                    <button type="submit" className="text-[13px] font-medium text-[#6F6B63] underline-offset-2 hover:text-[#111] hover:underline">
                      Logga ut
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </main>
  );
}
