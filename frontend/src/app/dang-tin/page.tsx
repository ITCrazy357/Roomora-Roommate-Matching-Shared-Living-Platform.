import type { Metadata } from "next";
import { ListingAccess } from "@/components/listings/listing-access";
import { ListingEditor } from "@/components/listings/listing-editor";
export const metadata: Metadata = { title: "Đăng tin phòng" };
export default function Page() {
  return (
    <ListingAccess>
      <ListingEditor />
    </ListingAccess>
  );
}
