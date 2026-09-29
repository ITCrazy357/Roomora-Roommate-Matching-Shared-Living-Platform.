import type { Metadata } from "next";
import { HouseDashboard } from "@/components/houses/house-dashboard";

export const metadata: Metadata = { title: "Quản lý nhà chung" };
export default async function HouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HouseDashboard id={id} />;
}
