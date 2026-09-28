import type { Metadata } from "next";
import { Inbox } from "@/components/communications/inbox";
export const metadata: Metadata = { title: "Hội thoại" };
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Inbox id={id} />;
}
