"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button, ErrorState, Input } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

interface RegisterResult {
  message: string;
  emailSent: boolean;
  developmentActionUrl?: string;
}

export function RegisterForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegisterResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirmPassword")) {
      setError("Mật khẩu nhập lại chưa khớp.");
      setPending(false);
      return;
    }
    try {
      const response = await apiFetch<RegisterResult>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      setResult(response);
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      eyebrow="BẮT ĐẦU VỚI ROOMORA"
      title="Tạo tài khoản"
      description="Một khởi đầu nhỏ cho nơi ở mới. Tạo tài khoản và giới thiệu đôi nét về bạn."
      welcome
    >
      {result ? (
        <div className="success-state" role="status">
          <p>{result.message}</p>
          {!result.emailSent && (
            <p>
              Email chưa gửi được. Bạn có thể yêu cầu gửi lại ở trang đăng nhập.
            </p>
          )}
          {result.developmentActionUrl && (
            <a className="text-link" href={result.developmentActionUrl}>
              Mở liên kết xác minh dành cho môi trường phát triển
            </a>
          )}
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <Input
            id="displayName"
            name="displayName"
            label="Tên hiển thị"
            autoComplete="name"
            placeholder="Bạn muốn được gọi là gì?"
            minLength={2}
            maxLength={80}
            required
          />
          <Input
            id="email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="ban@example.com"
            maxLength={320}
            required
          />
          <Input
            id="password"
            name="password"
            label="Mật khẩu"
            type="password"
            autoComplete="new-password"
            placeholder="Tạo mật khẩu của bạn"
            minLength={12}
            maxLength={128}
            hint="Tối thiểu 12 ký tự, có chữ cái và chữ số."
            required
          />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            label="Nhập lại mật khẩu"
            placeholder="Nhập lại mật khẩu vừa tạo"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
          {error && <ErrorState message={error} />}
          <Button type="submit" disabled={pending}>
            {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
          </Button>
        </form>
      )}
      <p className="auth-switch">
        Đã có tài khoản? <Link href="/dang-nhap">Đăng nhập</Link>
      </p>
    </AuthCard>
  );
}
