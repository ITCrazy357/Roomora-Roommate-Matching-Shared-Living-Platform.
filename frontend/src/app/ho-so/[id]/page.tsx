import type { Metadata } from "next";
import { PublicProfile } from "./public-profile";

export const metadata: Metadata = { title: "Hồ sơ người dùng" };

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicProfile userId={id} />;
}
