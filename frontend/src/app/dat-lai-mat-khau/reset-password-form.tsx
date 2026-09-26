"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button, Input } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetPasswordForm({ token }: { token?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(token ? "" : "Liên kết thiếu token.");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmation")) {
      setError("Mật khẩu nhập lại chưa khớp.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await apiFetch("/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: data.get("newPassword"),
        }),
      });
      setComplete(true);
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      eyebrow="BẢO MẬT TÀI KHOẢN"
      title="Đặt lại mật khẩu"
      description="Sau khi đổi mật khẩu, mọi phiên đăng nhập cũ sẽ bị thu hồi."
    >
      {complete ? (
        <div className="success-state" role="status">
          <p>Mật khẩu đã được thay đổi.</p>
          <Link className="text-link" href="/dang-nhap">
            Đăng nhập bằng mật khẩu mới
          </Link>
        </div>
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <Input
            id="newPassword"
            name="newPassword"
            label="Mật khẩu mới"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={!token}
          />
          <Input
            id="confirmation"
            name="confirmation"
            label="Nhập lại mật khẩu mới"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={!token}
          />
          {error && <div className="error-state">{error}</div>}
          <Button type="submit" disabled={pending || !token}>
            {pending ? "Đang cập nhật…" : "Đổi mật khẩu"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
