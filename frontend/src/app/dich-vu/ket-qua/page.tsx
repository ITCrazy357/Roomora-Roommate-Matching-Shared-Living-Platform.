import { PaymentResult } from "@/components/billing/payment-result";
export const metadata = { title: "Kết quả thanh toán" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <PaymentResult
      orderId={typeof params.orderId === "string" ? params.orderId : ""}
    />
  );
}
