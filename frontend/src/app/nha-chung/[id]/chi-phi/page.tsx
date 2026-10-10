import { FinancePage } from "@/components/houses/finance-pages";
export const metadata = { title: "Sổ chi phí nhà chung" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FinancePage houseId={id} />;
}
