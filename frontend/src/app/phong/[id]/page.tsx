import type { Metadata } from "next";
import { ListingDetail } from "@/components/listings/listing-detail";
export const metadata: Metadata = { title: "Chi tiết phòng" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingDetail key={id} id={id} />;
}
