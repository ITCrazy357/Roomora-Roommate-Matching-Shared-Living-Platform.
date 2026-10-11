"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { CurrentUser } from "./auth-provider";
import { Button, ErrorState } from "./ui";
import { ApiError, apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export interface OtpChallenge {
  challengeId: string;
  expiresAt: string;
  resendAt: string;
  serverTime: string;
  developmentOtp?: string;
}
export type OtpResult =
  { user: CurrentUser } | { token: string; expiresAt: string };

function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const fields = useRef<Array<HTMLInputElement | null>>([]);
  const id = useId();
  useEffect(() => {
    if (!disabled) fields.current[0]?.focus();
  }, [disabled]);

  function fill(text: string, index: number) {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    const start = digits.length === 6 ? 0 : index;
    const next = [...value];
    for (let offset = 0; offset < digits.length && start + offset < 6; offset++)
      next[start + offset] = digits[offset];
    onChange(next);
    fields.current[Math.min(start + digits.length, 5)]?.focus();
  }

  return (
    <fieldset
      className="otp-fieldset"
      disabled={disabled}
      aria-describedby={`${id}-hint`}
    >
      <legend>Mã xác nhận 6 số</legend>
      <div className="otp-inputs">
        {value.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              fields.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Chữ số ${index + 1}`}
            aria-invalid={invalid}
            value={digit}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              if (!event.target.value) {
                const next = [...value];
                next[index] = "";
                onChange(next);
              } else fill(event.target.value, index);
            }}
            onPaste={(event) => {
              event.preventDefault();
              fill(event.clipboardData.getData("text"), index);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault();
                const target = value[index] ? index : Math.max(0, index - 1);
                const next = [...value];
                next[target] = "";
                onChange(next);
                fields.current[target]?.focus();
              } else if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const target =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 5
                      : Math.max(
                          0,
                          Math.min(
                            5,
                            index + (event.key === "ArrowLeft" ? -1 : 1),
                          ),
                        );
                fields.current[target]?.focus();
              }
            }}
          />
        ))}
      </div>
      <p id={`${id}-hint`} className="text-muted text-sm">
        Bạn có thể nhập từng số hoặc dán cả mã vào một ô.
      </p>
    </fieldset>
  );
}

export function OtpPanel({
  email,
  initialChallenge,
  recovery = false,
  onVerified,
  onBack,
}: {
  email: string;
  initialChallenge: OtpChallenge;
  recovery?: boolean;
  onVerified: (result: OtpResult) => void;
  onBack?: () => void;
}) {
  const [challenge, setChallenge] = useState(initialChallenge);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => ({
    offset: Date.parse(initialChallenge.serverTime) - Date.now(),
    now: Date.parse(initialChallenge.serverTime),
  }));
  const [retryAt, setRetryAt] = useState(Date.parse(initialChallenge.resendAt));
  const remaining = Math.max(
    0,
    Math.ceil((Date.parse(challenge.expiresAt) - clock.now) / 1000),
  );
  const resendSeconds = Math.max(0, Math.ceil((retryAt - clock.now) / 1000));
  useEffect(() => {
    const timer = setInterval(
      () =>
        setClock((current) => ({
          ...current,
          now: Date.now() + current.offset,
        })),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (digits.join("").length !== 6 || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<OtpResult>(
        recovery ? "/auth/password/verify" : "/auth/email-verification/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            code: digits.join(""),
          }),
        },
      );
      onVerified(result);
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const next = await apiFetch<OtpChallenge>(
        recovery ? "/auth/password/forgot" : "/auth/email-verification/resend",
        {
          timeoutMs: 60_000,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      setChallenge(next);
      setDigits(Array(6).fill(""));
      setRetryAt(Date.parse(next.resendAt));
      setClock({
        offset: Date.parse(next.serverTime) - Date.now(),
        now: Date.parse(next.serverTime),
      });
      setNotice("Đã yêu cầu mã mới. Kiểm tra hộp thư và thư mục spam của bạn.");
    } catch (error) {
      setError(authErrorMessage(error));
      if (error instanceof ApiError && error.code === "OTP_SEND_LIMITED")
        setRetryAt(clock.now + 60_000);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="otp-panel">
      <div className="otp-envelope" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      </div>
      <div className="otp-recipient">
        <span>Kiểm tra hộp thư của bạn</span>
        <strong>{email}</strong>
        <small>
          Mã có hiệu lực 5 phút. Nếu chưa thấy email, hãy kiểm tra thư mục spam.
        </small>
      </div>
      <form className="form-stack" onSubmit={confirm}>
        <OtpInput
          key={challenge.challengeId}
          value={digits}
          onChange={(next) => {
            setDigits(next);
            setError("");
          }}
          disabled={pending}
          invalid={Boolean(error)}
        />
        <div className={`otp-validity${remaining === 0 ? " otp-expired" : ""}`}>
          <span className="otp-status-dot" />
          {remaining > 0
            ? `Mã còn hiệu lực ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : "Mã đã hết hạn. Hãy yêu cầu mã mới."}
        </div>
        {error && <ErrorState message={error} />}
        {notice && (
          <p className="success-state" role="status">
            {notice}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending || remaining === 0 || digits.join("").length !== 6}
        >
          {pending
            ? "Đang xử lý…"
            : recovery
              ? "Xác nhận & tiếp tục"
              : "Xác minh email"}
        </Button>
      </form>
      <div className="otp-resend">
        <span>Chưa nhận được mã?</span>
        <Button
          variant="secondary"
          disabled={pending || resendSeconds > 0}
          onClick={() => void resend()}
        >
          {resendSeconds > 0 ? `Gửi lại sau ${resendSeconds}s` : "Gửi lại mã"}
        </Button>
      </div>
      {onBack && (
        <button
          className="otp-back text-link"
          type="button"
          disabled={pending}
          onClick={onBack}
        >
          Dùng email khác
        </button>
      )}
      {challenge.developmentOtp && (
        <div className="otp-development">
          <strong>Chỉ trong môi trường phát triển</strong>
          <span>
            Mã thử nghiệm: <code>{challenge.developmentOtp}</code>
          </span>
        </div>
      )}
    </div>
  );
}
