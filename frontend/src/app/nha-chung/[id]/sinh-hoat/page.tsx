import type { Metadata } from "next";
import { HouseDashboard } from "@/components/houses/house-dashboard";
export const metadata: Metadata = { title: "Sinh hoạt chung" };
export default async function HouseholdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HouseDashboard id={id} initialTab="recurring" />;
}
