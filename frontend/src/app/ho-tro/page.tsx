import type { Metadata } from "next";
import { SupportWorkspace } from "@/components/support/support-workspace";
export const metadata: Metadata = { title: "Yêu cầu hỗ trợ" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket } = await searchParams;
  const id =
    ticket && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ticket)
      ? ticket
      : "";
  return <SupportWorkspace initialTicketId={id} />;
}
