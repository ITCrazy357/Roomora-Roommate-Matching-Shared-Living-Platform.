import type { Metadata } from "next";
import { AdminRefunds } from "@/components/admin/admin-refunds";
export const metadata: Metadata = { title: "Hoàn tiền dịch vụ" };
export default function Page() {
  return <AdminRefunds />;
}
