"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button, ErrorState, Input } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResetPasswordForm({
  token,
  onRestart,
}: {
  token: string;
  onRestart: () => void;
}) {
  const { setUser } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        body: JSON.stringify({ token, newPassword: data.get("newPassword") }),
      });
      setUser(null);
      setComplete(true);
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  if (complete)
    return (
      <div className="success-state otp-password-success" role="status">
        <strong>Mật khẩu đã được thay đổi</strong>
        <p>Bạn có thể đăng nhập lại bằng mật khẩu mới.</p>
        <Link className="button button-primary" href="/dang-nhap">
          Đăng nhập ngay
        </Link>
      </div>
    );
  return (
    <form className="form-stack" onSubmit={submit}>
      <Input
        id="newPassword"
        name="newPassword"
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        hint="Tối thiểu 12 ký tự, có chữ cái và chữ số."
        required
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
      />
      {error && <ErrorState message={error} />}
      <Button type="submit" disabled={pending}>
        {pending ? "Đang cập nhật…" : "Lưu mật khẩu mới"}
      </Button>
      <button
        className="otp-back text-link"
        type="button"
        onClick={onRestart}
        disabled={pending}
      >
        Xác nhận lại bằng mã mới
      </button>
    </form>
  );
}
