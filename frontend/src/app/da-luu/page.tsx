import type { Metadata } from "next";
import { ListingAccess } from "@/components/listings/listing-access";
import { ListingBrowser } from "@/components/listings/listing-browser";
export const metadata: Metadata = { title: "Tin đã lưu" };
export default function Page() {
  return (
    <ListingAccess>
      <ListingBrowser mode="saved" />
    </ListingAccess>
  );
}
