import type { Metadata } from "next";
import { AdminSecurity } from "@/components/admin/admin-security";
export const metadata: Metadata = { title: "Bảo mật tài khoản quản trị" };
export default function Page() {
  return <AdminSecurity />;
}
