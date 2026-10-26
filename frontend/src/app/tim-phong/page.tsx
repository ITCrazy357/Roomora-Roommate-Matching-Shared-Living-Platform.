import type { Metadata } from "next";
import { ListingBrowser } from "@/components/listings/listing-browser";

import { listingTypes, type ListingType } from "@/lib/listings";
import { siteOrigin } from "@/lib/seo";
import { serverListings } from "@/lib/server-listings";

export const metadata: Metadata = {
  title: "Tìm phòng",
  description:
    "Khám phá tin phòng cho thuê và tìm người ở ghép công khai trên Roomora. Lọc theo khu vực, giá thuê và tiện ích.",
  ...(siteOrigin()
    ? { alternates: { canonical: `${siteOrigin()}/tim-phong` } }
    : {}),
};

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    provinceCode?: string;
    maxRent?: string;
  }>;
}) {
  const { type, provinceCode, maxRent } = await searchParams;
  const initialType =
    type && Object.hasOwn(listingTypes, type) ? (type as ListingType) : "";
  const initialProvince =
    provinceCode && /^\d{2}$/.test(provinceCode) ? provinceCode : "";
  const initialMaxRent =
    maxRent && /^\d{1,9}$/.test(maxRent) && Number(maxRent) <= 100000000
      ? maxRent
      : "";
  const query = new URLSearchParams({ page: "1" });
  if (initialType) query.set("type", initialType);
  if (initialProvince) query.set("provinceCode", initialProvince);
  if (initialMaxRent) query.set("maxRent", initialMaxRent);
  const initialResult = await serverListings(query.toString());
  return (
    <ListingBrowser
      key={`${initialType}:${initialProvince}:${initialMaxRent}`}
      initialType={initialType}
      initialProvince={initialProvince}
      initialMaxRent={initialMaxRent}
      initialResult={initialResult}
    />
  );
}
