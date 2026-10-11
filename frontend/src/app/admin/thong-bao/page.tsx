import type { Metadata } from "next";
import { AdminAnnouncements } from "@/components/admin/admin-announcements";
export const metadata: Metadata = { title: "Thông báo hệ thống" };
export default function Page() {
  return <AdminAnnouncements />;
}
