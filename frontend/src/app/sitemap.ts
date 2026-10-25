import type { MetadataRoute } from "next";
import { serverApiUrl, siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!origin) return [];
  const urls: MetadataRoute.Sitemap = [
    "/",
    "/tim-phong",
    "/tim-nguoi-o-ghep",
  ].map((path) => ({ url: `${origin}${path}` }));
  let after: string | null = null;
  // One sitemap is bounded below the 50,000 URL limit; split before exceeding it.
  for (let page = 0; page < 49; page++) {
    const api = serverApiUrl(
      `/public/listing-sitemap${after ? `?after=${after}` : ""}`,
    );
    if (!api) break;
    const response = await fetch(api, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error("Không tải được danh mục tin công khai cho sitemap.");
    const data = (await response.json()) as {
      items: { id: string; updatedAt: string }[];
      next: string | null;
    };
    urls.push(
      ...data.items.map((item) => ({
        url: `${origin}/phong/${item.id}`,
        lastModified: item.updatedAt,
      })),
    );
    if (!data.next) break;
    after = data.next;
  }
  return urls;
}
