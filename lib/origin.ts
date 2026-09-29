export function publicOrigin(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto.split(",")[0]}://${host.split(",")[0]}` : new URL(req.url).origin;
}

export const internalOrigin = (req: Request) => `http://127.0.0.1:${process.env.PORT ?? (new URL(req.url).port || 3000)}`;
