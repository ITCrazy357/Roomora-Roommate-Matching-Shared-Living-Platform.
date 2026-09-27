import type { Metadata } from "next";
import { ListingBrowser } from "@/components/listings/listing-browser";

export const metadata: Metadata = { title: "Tìm phòng" };

export default function RoomsPage() {
  return <ListingBrowser />;
}
