"use client";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, ErrorState, Input } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
interface Challenge {
  challengeId: string;
  developmentOtp?: string;
  emailSent: boolean;
  resendAt: string;
}
export function AccountClosureCard() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function start() {
    setPending(true);
    setError("");
    try {
      const result = await apiFetch<Challenge>(
        "/auth/account-closure/request",
        { method: "POST" },
      );
      if (!result.emailSent && !result.developmentOtp) {
        setError("Chưa gửi được mã xác nhận qua email. Vui lòng thử lại sau.");
        return;
      }
      setChallenge(result);
      setCode("");
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }
  async function close(event: FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setPending(true);
    setError("");
    try {
      await apiFetch("/auth/account-closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          code,
          confirmed,
        }),
      });
      setUser(null);
      router.replace("/dang-nhap");
      router.refresh();
    } catch (error) {
      const messages: Record<string, string> = {
        ACCOUNT_HAS_HOUSE:
          "Chuyển quyền trưởng nhà và rời nhà trước khi đóng tài khoản.",
        ACCOUNT_HAS_DEBT:
          "Hoàn tất công nợ và khoản chuyển tiền đang chờ trong nhà cũ.",
        ACCOUNT_HAS_PAYMENT:
          "Hoàn tất đối soát thanh toán hoặc hoàn tiền trước khi đóng tài khoản.",
      };
      setError(
        error instanceof ApiError && error.code && messages[error.code]
          ? messages[error.code]
          : authErrorMessage(error),
      );
      setPending(false);
    }
  }
  if (user?.role !== "USER") return null;
  return (
    <Card className="settings-card">
      <h2>Đóng tài khoản</h2>
      <p className="text-muted">
        Tài khoản sẽ dừng hoạt động, đăng xuất khỏi mọi thiết bị và ẩn hồ sơ,
        tin đăng. Lịch sử giao dịch, công nợ và kiểm duyệt được giữ để đối
        chiếu. Nếu muốn khôi phục, bạn cần liên hệ quản trị viên Roomora.
      </p>
      <p className="text-muted">
        Bạn cần chuyển quyền trưởng nhà, rời nhà, hoàn tất công nợ và các thanh
        toán hoặc hoàn tiền đang chờ trước khi đóng.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={pending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>Tôi hiểu và muốn đóng tài khoản.</span>
      </label>
      {!challenge ? (
        <Button
          variant="secondary"
          disabled={pending || !confirmed}
          onClick={start}
        >
          Gửi mã xác nhận qua email
        </Button>
      ) : (
        <form className="form-stack" onSubmit={close}>
          <p>Nhập mã xác nhận gửi đến {user.email}.</p>
          {challenge.developmentOtp && (
            <p className="admin-callout">
              Mã kiểm thử local: {challenge.developmentOtp}
            </p>
          )}
          <Input
            id="closure-code"
            label="Mã xác nhận gồm 6 chữ số"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="submit" disabled={pending || !confirmed}>
            Xác nhận đóng tài khoản
          </Button>
          <Button
            variant="secondary"
            disabled={pending || now < Date.parse(challenge.resendAt)}
            onClick={start}
          >
            Gửi lại mã
          </Button>
        </form>
      )}
      {error && <ErrorState message={error} />}
    </Card>
  );
}
