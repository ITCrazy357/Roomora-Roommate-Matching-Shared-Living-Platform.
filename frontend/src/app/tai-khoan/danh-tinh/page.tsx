import type { Metadata } from "next";
import { IdentityForm } from "@/components/identity/identity-form";
export const metadata: Metadata = { title: "Khai báo danh tính" };
export default function Page() {
  return <IdentityForm />;
}
