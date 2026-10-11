import { Services } from "@/components/billing/services";
export const metadata = { title: "Dịch vụ Roomora" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab =
    params.tab === "history" || params.tab === "services"
      ? params.tab
      : "plans";
  return (
    <Services
      key={`${tab}:${typeof params.listing === "string" ? params.listing : ""}`}
      initialTab={tab}
      initialListing={typeof params.listing === "string" ? params.listing : ""}
    />
  );
}
