import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isWorkspaceId, WS_COOKIE, WS_MAX_AGE } from "@/lib/newwave/workspaceId";

function authorized(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [, pass] = atob(header.slice(6)).split(":");
  return pass === password;
}

export function proxy(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse("Inloggning krävs", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Craft Klubbmerch demo", charset="UTF-8"' },
    });
  }
  if (request.nextUrl.pathname.startsWith("/api/") || isWorkspaceId(request.cookies.get(WS_COOKIE)?.value)) return NextResponse.next();

  /** Besökaren får en egen demomiljö vid första sidvisningen; API-anrop utan cookie (webhooks) använder grunddatan. */
  const id = crypto.randomUUID().replace(/-/g, "");
  request.cookies.set(WS_COOKIE, id);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(WS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: WS_MAX_AGE, path: "/" });
  return res;
}

export const config = {
  matcher: ["/((?!api/mock-intersport|_next/static|_next/image|favicon.ico).*)"],
};
