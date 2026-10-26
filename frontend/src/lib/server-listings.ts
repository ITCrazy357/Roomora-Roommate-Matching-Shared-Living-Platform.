import "server-only";
import { serverApiUrl } from "./seo";
import type { ListingPage } from "./listings";

export async function serverListings(
  query: string,
): Promise<ListingPage | null> {
  const url = serverApiUrl(`/listings?${query}`);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? ((await response.json()) as ListingPage) : null;
  } catch {
    return null;
  }
}
