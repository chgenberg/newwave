import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["potrace", "sharp", "playwright-core"],
  allowedDevOrigins: ["192.168.1.174"],
  /** Ingenting på sajten ska indexeras, arkiveras eller användas för att träna AI. */
  headers: async () => [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" }] }],
};

export default nextConfig;
