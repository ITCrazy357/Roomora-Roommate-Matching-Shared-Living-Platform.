import type { Metadata } from "next";
import { PublicPerson } from "@/components/people/public-person";

export const metadata: Metadata = { title: "Hồ sơ người dùng" };

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicPerson userId={id} />;
}
