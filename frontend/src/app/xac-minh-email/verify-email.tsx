"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthCard } from "@/components/auth-card";
import { useAuth, type CurrentUser } from "@/components/auth-provider";
import { ButtonLink, LoadingState } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function VerifyEmail({ token }: { token?: string }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const started = useRef(false);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const [message, setMessage] = useState(
    token ? "" : "Liên kết xác minh thiếu token.",
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiFetch<{ user: CurrentUser }>("/auth/email-verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(({ user }) => {
        setUser(user);
        setStatus("success");
        setTimeout(
          () =>
            router.replace(
              user.onboardingCompleted ? "/tai-khoan/ho-so" : "/onboarding",
            ),
          900,
        );
      })
      .catch((error) => {
        setMessage(authErrorMessage(error));
        setStatus("error");
      });
  }, [token, setUser, router]);

  return (
    <AuthCard
      eyebrow="XÁC MINH TÀI KHOẢN"
      title="Xác minh email"
      description="Liên kết chỉ dùng một lần và hết hạn sau 24 giờ."
    >
      {status === "loading" && <LoadingState message="Đang xác minh…" />}
      {status === "success" && (
        <div className="success-state" role="status">
          Email đã được xác minh. Đang mở hồ sơ của bạn…
        </div>
      )}
      {status === "error" && (
        <div className="error-state">
          <p>{message}</p>
          <ButtonLink href="/gui-lai-xac-minh" variant="secondary">
            Yêu cầu liên kết mới
          </ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
