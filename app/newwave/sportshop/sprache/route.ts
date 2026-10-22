import { NextResponse } from "next/server";
import { LANG_COOKIE, parseLang } from "@/lib/newwave/sportshop/i18n";

const HOME = "/newwave/sportshop";

/** Byter butikens språk och går tillbaka till samma sida; cookien sätts av servern så att det fungerar i alla webbläsare. */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const back = q.get("r") ?? HOME;
  const target = back === HOME || (back.startsWith(`${HOME}/`) && !back.includes("\\")) || back.startsWith(`${HOME}?`) ? back : HOME;
  const res = new NextResponse(null, { status: 303, headers: { Location: target } });
  res.cookies.set(LANG_COOKIE, parseLang(q.get("l") ?? undefined), { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}
