import { cache } from "react";
import type { Listing } from "./listings";
import { serverApiUrl } from "./seo";

// No browser cookies or user headers: this request can never take the owner shortcut.
export const publicListing = cache(
  async (id: string): Promise<Listing | null> => {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;

    const url = serverApiUrl(`/listings/${id}`);

    if (!url) return null;
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const listing = (await response.json()) as Listing;
      return listing.status === "PUBLISHED" ? listing : null;
    } catch {
      return null;
    }
  },
);
