import type { Metadata } from "next";
import { ListingAccess } from "@/components/listings/listing-access";
import { ListingEditor } from "@/components/listings/listing-editor";
export const metadata: Metadata = { title: "Chỉnh sửa tin phòng" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ListingAccess>
      <ListingEditor key={id} id={id} />
    </ListingAccess>
  );
}
