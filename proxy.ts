import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [, pass] = atob(header.slice(6)).split(":");
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Inloggning krävs", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Craft Klubbmerch demo", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/mock-intersport|_next/static|_next/image|favicon.ico).*)"],
};
