"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { GoogleAuthNotice } from "@/components/google-auth-notice";
import { GoogleIcon } from "@/components/google-sign-in";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function GoogleAccountCard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<{
    enabled: boolean;
    linked: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ enabled: boolean; linked: boolean }>("/auth/google/status", {
      signal: controller.signal,
    })
      .then(setStatus)
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(authErrorMessage(loadError));
      });
    const restoreButton = () => setPending(false);
    window.addEventListener("pageshow", restoreButton);
    return () => {
      controller.abort();
      window.removeEventListener("pageshow", restoreButton);
    };
  }, []);

  async function linkGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    setPending(true);
    setError("");
    try {
      const result = await apiFetch<{ url: string }>("/auth/google/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      form.reset();
      window.location.assign(result.url);
    } catch (linkError) {
      setError(authErrorMessage(linkError));
      setPending(false);
    }
  }

  return (
    <Card className="settings-card google-account-card">
      <span className="eyebrow">CÁCH ĐĂNG NHẬP</span>
      <h2>
        <GoogleIcon /> Tài khoản Google
      </h2>
      <GoogleAuthNotice />
      {!status && !error && <LoadingState message="Đang kiểm tra liên kết…" />}
      {status?.linked ? (
        <p className="text-muted">
          Đã liên kết. Bạn có thể dùng Google để đăng nhập vào tài khoản này.
        </p>
      ) : status?.enabled ? (
        <form className="form-stack" onSubmit={linkGoogle}>
          <p className="text-muted">
            Xác nhận mật khẩu Roomora, sau đó chọn tài khoản Google có email{" "}
            <strong>{user?.email}</strong>.
          </p>
          <Input
            id="google-link-password"
            name="password"
            label="Mật khẩu Roomora"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
          <Button
            type="submit"
            variant="secondary"
            className="google-button"
            disabled={pending}
          >
            <GoogleIcon />
            {pending ? "Đang mở Google…" : "Liên kết Google"}
          </Button>
        </form>
      ) : (
        status && (
          <p className="text-muted">Đăng nhập Google hiện chưa được bật.</p>
        )
      )}
      {error && <ErrorState message={error} />}
    </Card>
  );
}
