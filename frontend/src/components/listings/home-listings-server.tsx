import "server-only";
import { serverApiUrl } from "@/lib/seo";
import type { ListingPage, ListingType } from "@/lib/listings";
import { HomeListings } from "./home-listings";

export async function HomeListingsServer() {
  const types: ListingType[] = ["ROOMMATE", "ROOM_RENTAL", "ROOM_WANTED"];
  const entries = await Promise.all(
    types.map(async (type) => {
      const url = serverApiUrl(`/listings?type=${type}&limit=3`);
      let result: ListingPage | null = null;
      if (url) {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            credentials: "omit",
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) result = (await response.json()) as ListingPage;
        } catch {
          /* The client retains its loading/error/retry path. */
        }
      }
      return [type, result] as const;
    }),
  );
  return (
    <HomeListings
      initial={
        Object.fromEntries(entries) as Record<ListingType, ListingPage | null>
      }
    />
  );
}
