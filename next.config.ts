import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["potrace", "sharp", "playwright-core"],
  allowedDevOrigins: ["192.168.1.174"],
  /** Ingenting på sajten ska indexeras, arkiveras eller användas för att träna AI. */
  /** Gräsrot 360 flyttade från New Waves hubb till Crafts dashboard; utskickade länkar ska fortsätta fungera. */
  redirects: async () => [{ source: "/newwave/new-wave/grasrot/:path*", destination: "/newwave/craft/grasrot/:path*", permanent: true }],
  headers: async () => [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" }] }],
};

export default nextConfig;
