import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  // Private pages remain crawlable so crawlers can read their X-Robots-Tag: noindex.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
