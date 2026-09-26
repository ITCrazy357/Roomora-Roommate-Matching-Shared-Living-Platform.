import type { Metadata } from "next";
import { EmailActionForm } from "@/components/email-action-form";

export const metadata: Metadata = { title: "Gửi lại email xác minh" };

export default function ResendVerificationPage() {
  return <EmailActionForm mode="resend-verification" />;
}
