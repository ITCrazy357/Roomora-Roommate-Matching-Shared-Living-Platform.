import type { Metadata } from "next";
import { ConnectionInbox } from "@/components/people/connection-inbox";
export const metadata: Metadata = { title: "Yêu cầu kết nối" };
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <ConnectionInbox
      initialTab={tab === "accepted" ? "accepted" : "received"}
    />
  );
}
