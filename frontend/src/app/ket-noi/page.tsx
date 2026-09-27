import type { Metadata } from "next";
import { ConnectionInbox } from "@/components/people/connection-inbox";
export const metadata: Metadata = { title: "Yêu cầu kết nối" };
export default function ConnectionsPage() {
  return <ConnectionInbox />;
}
