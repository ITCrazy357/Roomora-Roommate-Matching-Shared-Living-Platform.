"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthCard } from "./auth-card";
import { Button, Input } from "./ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function EmailActionForm({
  mode,
}: {
  mode: "forgot-password" | "resend-verification";
}) {
  const forgot = mode === "forgot-password";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    message: string;
    developmentActionUrl?: string;
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const email = new FormData(event.currentTarget).get("email");
    try {
      setResult(
        await apiFetch(
          forgot ? "/auth/password/forgot" : "/auth/email-verification/resend",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          },
        ),
      );
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      eyebrow={forgot ? "KHÔI PHỤC TÀI KHOẢN" : "XÁC MINH EMAIL"}
      title={forgot ? "Quên mật khẩu" : "Gửi lại email xác minh"}
      description={
        forgot
          ? "Nhập email. Phản hồi luôn giống nhau để không tiết lộ tài khoản có tồn tại hay không."
          : "Nếu tài khoản tồn tại và chưa xác minh, Roomora sẽ tạo một liên kết mới."
      }
    >
      {result ? (
        <div className="success-state" role="status">
          <p>{result.message}</p>
          {result.developmentActionUrl && (
            <a className="text-link" href={result.developmentActionUrl}>
              Mở liên kết dành cho môi trường phát triển
            </a>
          )}
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            label="Email"
            required
          />
          {error && <div className="error-state">{error}</div>}
          <Button type="submit" disabled={pending}>
            {pending ? "Đang gửi…" : "Gửi liên kết"}
          </Button>
        </form>
      )}
      <p className="auth-switch">
        <Link href="/dang-nhap">Quay lại đăng nhập</Link>
      </p>
    </AuthCard>
  );
}
