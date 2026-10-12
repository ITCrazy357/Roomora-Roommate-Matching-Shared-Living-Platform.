import type { Metadata } from "next";
import { ListingAccess } from "@/components/listings/listing-access";
import { ListingEditor } from "@/components/listings/listing-editor";
import type { ListingType } from "@/lib/listings";
export const metadata: Metadata = { title: "Đăng tin phòng" };
export default async function Page({ searchParams }: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  const initialType: ListingType = type === "ROOM_WANTED" || type === "ROOM_RENTAL" ? type : "ROOMMATE";
  return (
    <ListingAccess>
      <ListingEditor key={initialType} initialType={initialType} />
    </ListingAccess>
  );
}
