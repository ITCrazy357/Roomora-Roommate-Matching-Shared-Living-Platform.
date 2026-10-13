import type { Metadata } from "next";
import { AdminOrders } from "@/components/admin/admin-orders";
export const metadata: Metadata = { title: "Tra cứu giao dịch" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  return <AdminOrders initialSearch={search?.slice(0, 150)} />;
}
