import type { Metadata } from "next";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Xác minh email" };

export default function VerifyEmailPage() {
  return <VerifyEmail />;
}
