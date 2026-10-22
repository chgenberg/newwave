import type { MetadataRoute } from "next";

/** Sajten är ett lösenordsskyddat demo: ingen crawler, sökmotor eller AI ska läsa den. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
