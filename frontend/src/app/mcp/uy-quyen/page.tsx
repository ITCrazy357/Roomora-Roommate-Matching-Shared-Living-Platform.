import type { Metadata } from "next";
import { ConsentPanel } from "./consent-panel";

export const metadata: Metadata = {
  title: "Cho phép ứng dụng AI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request } = await searchParams;
  return (
    <div className="container section">
      <ConsentPanel requestId={request ?? ""} />
    </div>
  );
}
