"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, ADMIN_COOKIE, accessToken, isAdmin, safeNext, STATS_PATH } from "@/lib/access";
import { createLimiter } from "@/lib/demoLimit";
import { isVisitorId, logVisit, VISITOR_COOKIE } from "@/lib/visits";

const tries = createLimiter(() => ({ perKey: 10, global: 300, windowMs: 10 * 60_000 }));

export type LoginState = { error: string } | null;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const admin = form.get("scope") === "admin";
  const password = admin ? process.env.ADMIN_PASSWORD : process.env.DEMO_PASSWORD;
  const next = admin ? STATS_PATH : safeNext(form.get("till"));
  if (!password) redirect(next);

  const h = await headers();
  const jar = await cookies();
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  if (!tries.take(ip).ok) return { error: "För många försök. Vänta några minuter och försök igen." };

  const given = Buffer.from(await accessToken(String(form.get("password") ?? ""), admin ? "admin" : "access"));
  const want = Buffer.from(await accessToken(password, admin ? "admin" : "access"));
  const ok = timingSafeEqual(given, want);

  const vid = jar.get(VISITOR_COOKIE)?.value;
  if (isVisitorId(vid) && (admin ? ok : !(await isAdmin(jar.get(ADMIN_COOKIE)?.value)))) {
    await logVisit({ type: admin ? "admin" : ok ? "login" : "fail", vid, ip: ip.slice(0, 64), ua: (h.get("user-agent") ?? "").slice(0, 300) }).catch(() => {});
  }
  if (!ok) return { error: "Fel lösenord. Försök igen." };

  jar.set(admin ? ADMIN_COOKIE : ACCESS_COOKIE, want.toString(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: ACCESS_MAX_AGE, path: "/" });
  redirect(next);
}
