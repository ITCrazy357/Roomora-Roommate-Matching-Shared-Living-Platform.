import type { Metadata } from "next";
import { ListingBrowser } from "@/components/listings/listing-browser";

import { listingTypes, type ListingType } from "@/lib/listings";

export const metadata: Metadata = { title: "Tìm phòng" };

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initialType =
    type && Object.hasOwn(listingTypes, type) ? (type as ListingType) : "";
  return <ListingBrowser key={initialType} initialType={initialType} />;
}
