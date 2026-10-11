import { EmailActionForm } from "@/components/email-action-form";

export function VerifyEmail() {
  return <EmailActionForm mode="resend-verification" />;
}
