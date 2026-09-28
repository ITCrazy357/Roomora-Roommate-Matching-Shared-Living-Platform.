import type { Metadata } from "next";
import { Inbox } from "@/components/communications/inbox";
export const metadata: Metadata = { title: "Tin nhắn" };
export default function InboxPage() {
  return <Inbox />;
}
