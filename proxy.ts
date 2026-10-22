import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess, isOpen, LOGIN_PATH } from "@/lib/access";
import { isBlockedBot } from "@/lib/bots";
import { CLUB_MAX_AGE, clubAccess } from "@/lib/newwave/clubLink";
import { ALIAS_HOSTS, SITE } from "@/lib/newwave/site";
import { DEMO_PARAM, isWorkspaceId, WS_COOKIE, WS_MAX_AGE } from "@/lib/newwave/workspaceId";
import { isVisitorId, newVisitorId, VISITOR_COOKIE, VISITOR_MAX_AGE } from "@/lib/visits";

async function authorized(request: NextRequest) {
  return isOpen(request.nextUrl.pathname) || hasAccess(request.cookies.get(ACCESS_COOKIE)?.value);
}

export async function proxy(request: NextRequest) {
  /** API-anrop stannar kvar, så att webhooks och redan utskickade fillänkar fortsätter fungera på den gamla adressen. */
  if (ALIAS_HOSTS.includes(request.headers.get("host") ?? "") && !request.nextUrl.pathname.startsWith("/api/")) {
    const target = new URL(SITE);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }
  if (process.env.NODE_ENV === "production" && isBlockedBot(request.nextUrl.pathname, request.headers.get("user-agent"))) {
    return new NextResponse("Inte tillgänglig.", { status: 403, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  const insider = await authorized(request);
  /** Klubbar och deras supportrar med en personlig länk når bara klubbens sidor, utan egen demomiljö – svaren ska Craft se. */
  const club = insider ? null : await clubAccess(request.nextUrl, request.method, (name) => request.cookies.get(name)?.value);
  if (!insider && !club) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Logga in med lösenordet först." }, { status: 401 });
    const login = new URL(LOGIN_PATH, request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/" && next !== "/newwave") login.searchParams.set("till", next);
    return NextResponse.redirect(login);
  }
  const res = club ? NextResponse.next() : workspace(request);
  if (club?.set) res.cookies.set(club.set.name, club.set.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: CLUB_MAX_AGE, path: "/" });
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
