import type { Metadata } from "next";
import { AdminUsers } from "@/components/admin/admin-users";
export const metadata: Metadata = { title: "Quản lý người dùng" };
export default function Page() {
  return <AdminUsers />;
}
