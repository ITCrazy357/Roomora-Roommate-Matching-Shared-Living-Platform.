"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { useAuth, type CurrentUser } from "@/components/auth-provider";
import { Button, ErrorState, Input } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiFetch<{ user: CurrentUser }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      setUser(response.user);
      router.replace(
        response.user.onboardingCompleted ? "/tai-khoan/ho-so" : "/onboarding",
      );
      router.refresh();
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      eyebrow="CHÀO MỪNG BẠN TRỞ LẠI"
      title="Đăng nhập"
      description="Tiếp tục hoàn thiện hồ sơ và tìm nhịp sống phù hợp với bạn."
      welcome
    >
      <form className="form-stack" onSubmit={submit}>
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
          autoComplete="current-password"
          placeholder="Nhập mật khẩu của bạn"
          maxLength={128}
          required
        />
        <Link className="auth-forgot" href="/quen-mat-khau">
          Quên mật khẩu?
        </Link>
        {error && <ErrorState message={error} />}
        <Button type="submit" disabled={pending}>
          {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        </Button>
      </form>
      <div className="auth-links">
        <Link href="/gui-lai-xac-minh">Gửi lại email xác minh</Link>
      </div>
      <p className="auth-switch">
        Chưa có tài khoản? <Link href="/dang-ky">Tạo tài khoản</Link>
      </p>
    </AuthCard>
  );
}
