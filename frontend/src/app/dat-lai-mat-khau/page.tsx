import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  redirect("/quen-mat-khau");
}
