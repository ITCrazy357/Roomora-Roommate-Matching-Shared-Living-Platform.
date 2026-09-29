import type { Metadata } from "next";
import { HouseDashboard } from "@/components/houses/house-dashboard";

export const metadata: Metadata = { title: "Nhà chung" };
export default function HousePage() {
  return <HouseDashboard />;
}
