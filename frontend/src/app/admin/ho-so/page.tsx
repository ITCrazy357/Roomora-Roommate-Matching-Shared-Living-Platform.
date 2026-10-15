import type { Metadata } from "next";
import { AdminIdentities } from "@/components/admin/admin-identities";
export const metadata: Metadata = { title: "Tra cứu hồ sơ" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId } = await searchParams;
  return <AdminIdentities initialUserId={userId} />;
}
