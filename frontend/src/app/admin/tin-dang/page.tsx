import type { Metadata } from "next";
import { ListingModeration } from "@/components/listings/listing-moderation";
export const metadata: Metadata = { title: "Kiểm duyệt tin đăng" };
export default function Page() {
  return <ListingModeration />;
}
