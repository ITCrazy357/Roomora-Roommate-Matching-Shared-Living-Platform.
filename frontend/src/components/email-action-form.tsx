"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AuthCard } from "./auth-card";
import { useAuth } from "./auth-provider";
import { OtpPanel, type OtpChallenge, type OtpResult } from "./otp-panel";
import { Button, ErrorState, Input } from "./ui";
import { ResetPasswordForm } from "@/app/dat-lai-mat-khau/reset-password-form";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function EmailActionForm({
  mode,
}: {
  mode: "forgot-password" | "resend-verification";
}) {
  const forgot = mode === "forgot-password";
  const router = useRouter();
  const { setUser } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [grant, setGrant] = useState<{
    token: string;
    expiresAt: string;
  } | null>(null);

  function restart() {
    setChallenge(null);
    setGrant(null);
    setError("");
  }
  function verified(result: OtpResult) {
    if ("token" in result) setGrant(result);
    else {
      setUser(result.user);
      router.replace(
        result.user.role === "ADMIN"
          ? "/admin/tin-dang"
          : result.user.onboardingCompleted
            ? "/tai-khoan/ho-so"
            : "/onboarding",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const address = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();
    try {
      const response = await apiFetch<OtpChallenge>(
        forgot ? "/auth/password/forgot" : "/auth/email-verification/resend",
        {
          timeoutMs: 60_000,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: address }),
        },
      );
      setEmail(address);
      setChallenge(response);
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const step = grant ? 3 : challenge ? 2 : 1;
  return (
    <AuthCard
      title={
        grant
          ? "Tạo mật khẩu mới"
          : challenge
            ? "Nhập mã xác nhận"
            : forgot
              ? "Quên mật khẩu?"
              : "Xác minh email của bạn"
      }
      description={
        grant
          ? "Chọn mật khẩu mới để bảo vệ tài khoản. Các thiết bị cũ sẽ được đăng xuất sau khi đổi."
          : challenge
            ? "Chỉ một bước nữa để tiếp tục với Roomora."
            : forgot
              ? "Nhập email đã đăng ký để nhận mã xác nhận và đặt lại mật khẩu."
              : "Nhập email đã đăng ký để nhận mã xác nhận 6 số."
      }
    >
      <nav className="otp-steps" aria-label="Các bước xác thực">
        <span aria-current={step === 1 ? "step" : undefined}>
          <b>1</b>Email
        </span>
        <span aria-current={step === 2 ? "step" : undefined}>
          <b>2</b>Xác nhận mã
        </span>
        {forgot && (
          <span aria-current={step === 3 ? "step" : undefined}>
            <b>3</b>Mật khẩu mới
          </span>
        )}
      </nav>
      {grant ? (
        <ResetPasswordForm token={grant.token} onRestart={restart} />
      ) : challenge ? (
        <OtpPanel
          key={challenge.challengeId}
          email={email}
          initialChallenge={challenge}
          recovery={forgot}
          onVerified={verified}
          onBack={restart}
        />
      ) : (
        <form className="form-stack" onSubmit={submit}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            label="Email của bạn"
            placeholder="ban@example.com"
            defaultValue={email}
            maxLength={320}
            required
          />
          {error && <ErrorState message={error} />}
          <Button type="submit" disabled={pending}>
            {pending ? "Đang gửi…" : "Gửi mã xác nhận"}
          </Button>
          {forgot && (
            <p className="text-muted text-sm">
              Tài khoản chỉ dùng Google: chọn Đăng nhập với Google ở trang đăng
              nhập.
            </p>
          )}
        </form>
      )}
      <p className="auth-switch">
        <Link href="/dang-nhap">Quay lại đăng nhập</Link>
      </p>
    </AuthCard>
  );
}
