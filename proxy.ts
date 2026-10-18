import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, accessToken, isOpen, LOGIN_PATH } from "@/lib/access";
import { ALIAS_HOSTS, SITE } from "@/lib/newwave/site";
import { DEMO_PARAM, isWorkspaceId, WS_COOKIE, WS_MAX_AGE } from "@/lib/newwave/workspaceId";
import { isVisitorId, newVisitorId, VISITOR_COOKIE, VISITOR_MAX_AGE } from "@/lib/visits";

async function authorized(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password || isOpen(request.nextUrl.pathname)) return true;
  return request.cookies.get(ACCESS_COOKIE)?.value === (await accessToken(password));
}

export async function proxy(request: NextRequest) {
  /** API-anrop stannar kvar, så att webhooks och redan utskickade fillänkar fortsätter fungera på den gamla adressen. */
  if (ALIAS_HOSTS.includes(request.headers.get("host") ?? "") && !request.nextUrl.pathname.startsWith("/api/")) {
    const target = new URL(SITE);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }
  if (!(await authorized(request))) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Logga in med lösenordet först." }, { status: 401 });
    const login = new URL(LOGIN_PATH, request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/" && next !== "/newwave") login.searchParams.set("till", next);
    return NextResponse.redirect(login);
  }
  const res = workspace(request);
  /** Besöksloggens id sätts redan med sidan, så att webbläsarens första anrop till loggen har det. */
  if (!request.nextUrl.pathname.startsWith("/api/") && !isVisitorId(request.cookies.get(VISITOR_COOKIE)?.value)) {
    res.cookies.set(VISITOR_COOKIE, newVisitorId(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: VISITOR_MAX_AGE, path: "/" });
  }
  return res;
}

function workspace(request: NextRequest) {
  const current = request.cookies.get(WS_COOKIE)?.value;
  /** En delad länk eller QR-kod (`?demo=`) tar med sig avsändarens demomiljö, så att mobilen ser samma butik. */
  const shared = request.nextUrl.searchParams.get(DEMO_PARAM) ?? undefined;
  const join = !request.nextUrl.pathname.startsWith("/api/") && isWorkspaceId(shared) && shared !== current;
  if (!join && (request.nextUrl.pathname.startsWith("/api/") || isWorkspaceId(current))) return NextResponse.next();

  /** Besökaren får en egen demomiljö vid första sidvisningen; API-anrop utan cookie (webhooks) använder grunddatan. */
  const id = join ? shared! : crypto.randomUUID().replace(/-/g, "");
  request.cookies.set(WS_COOKIE, id);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(WS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: WS_MAX_AGE, path: "/" });
  return res;
}

export const config = {
  matcher: ["/((?!api/mock-intersport|_next/static|_next/image|favicon.ico).*)"],
};
