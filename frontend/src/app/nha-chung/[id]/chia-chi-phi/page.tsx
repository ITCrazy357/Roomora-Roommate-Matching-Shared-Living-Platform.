import type { Metadata } from "next";
import { HouseDashboard } from "@/components/houses/house-dashboard";
export const metadata: Metadata = { title: "Thống nhất chia chi phí" };
export default async function SharingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HouseDashboard id={id} initialTab="sharing" />;
}
