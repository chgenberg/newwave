"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, ACCESS_MAX_AGE, accessToken, safeNext } from "@/lib/access";
import { createLimiter } from "@/lib/demoLimit";

const tries = createLimiter(() => ({ perKey: 10, global: 300, windowMs: 10 * 60_000 }));

export type LoginState = { error: string } | null;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const password = process.env.DEMO_PASSWORD;
  const next = safeNext(form.get("till"));
  if (!password) redirect(next);

  const h = await headers();
  const ip = h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  if (!tries.take(ip).ok) return { error: "För många försök. Vänta några minuter och försök igen." };

  const given = Buffer.from(await accessToken(String(form.get("password") ?? "")));
  const want = Buffer.from(await accessToken(password));
  if (!timingSafeEqual(given, want)) return { error: "Fel lösenord. Försök igen." };

  (await cookies()).set(ACCESS_COOKIE, want.toString(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: ACCESS_MAX_AGE, path: "/" });
  redirect(next);
}
