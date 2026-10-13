import { AdminListingDetail } from "@/components/admin/admin-listing-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminListingDetail id={id} />;
}
