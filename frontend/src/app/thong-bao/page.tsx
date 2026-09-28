import type { Metadata } from "next";
import { Notifications } from "@/components/communications/notifications";
export const metadata: Metadata = { title: "Thông báo" };
export default function NotificationsPage() {
  return <Notifications />;
}
