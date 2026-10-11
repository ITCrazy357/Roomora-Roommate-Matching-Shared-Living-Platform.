import type { Metadata } from "next";
import { AdminReports } from "@/components/admin/admin-reports";
export const metadata: Metadata = { title: "Báo cáo vi phạm" };
export default function Page() {
  return <AdminReports />;
}
