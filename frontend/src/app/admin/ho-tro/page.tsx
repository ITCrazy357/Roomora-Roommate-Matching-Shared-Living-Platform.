import type { Metadata } from "next";
import { SupportWorkspace } from "@/components/support/support-workspace";
export const metadata: Metadata = { title: "Quản lý yêu cầu hỗ trợ" };
export default function Page() {
  return <SupportWorkspace admin />;
}
