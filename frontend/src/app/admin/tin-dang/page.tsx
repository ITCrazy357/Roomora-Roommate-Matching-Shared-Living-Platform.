import type { Metadata } from "next";
import { ListingAccess } from "@/components/listings/listing-access";
import { ListingModeration } from "@/components/listings/listing-moderation";
export const metadata: Metadata = { title: "Kiểm duyệt tin đăng" };
export default function Page() {
  return (
    <ListingAccess admin>
      <ListingModeration />
    </ListingAccess>
  );
}
