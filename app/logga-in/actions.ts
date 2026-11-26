"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { internalPath, isRole, login, logout, ROLE_HOME } from "@/lib/poc/auth";

/**
 * Serveråtgärderna för POC-flödets inloggning. `logoutAction` kan användas direkt i ett formulär på andra sidor:
 * `<form action={logoutAction}>` med de dolda fälten `roll` (utan den loggas alla ut) och `next`.
 */

export type LoginState = { error: string } | null;

/** Misslyckade försök per adress de senaste tio minuterna; efter tio får man vänta. */
const FAILS_MAX = 10;
const FAILS_WINDOW = 10 * 60_000;
const fails = ((globalThis as unknown as { pocLoginFails?: Map<string, number[]> }).pocLoginFails ??= new Map<string, number[]>());

function recentFails(ip: string, now = Date.now()) {
  const list = (fails.get(ip) ?? []).filter((t) => now - t < FAILS_WINDOW);
  if (list.length) fails.set(ip, list);
  else fails.delete(ip);
  return list;
}

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const role = form.get("roll");
  if (!isRole(role)) return { error: "Välj vem du loggar in som." };
  const h = await headers();
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "okänd";
  if (recentFails(ip).length >= FAILS_MAX) return { error: "För många försök. Vänta några minuter och försök igen." };
  if (!(await login(role, String(form.get("password") ?? "")))) {
    if (fails.size > 10_000) fails.clear();
    fails.set(ip, [...recentFails(ip), Date.now()]);
    return { error: "Fel lösenord. Försök igen." };
  }
  redirect(internalPath(form.get("next")) ?? ROLE_HOME[role]);
}

export async function logoutAction(form: FormData): Promise<void> {
  const role = form.get("roll");
  await logout(isRole(role) ? role : undefined);
  redirect(internalPath(form.get("next")) ?? "/logga-in");
}
