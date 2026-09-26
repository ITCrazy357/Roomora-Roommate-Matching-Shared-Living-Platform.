import type { Metadata } from "next";
import { EmailActionForm } from "@/components/email-action-form";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return <EmailActionForm mode="forgot-password" />;
}
