"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";

type Consent = {
  clientName: string;
  callbackOrigin: string;
  scope: string;
  expiresAt: string;
};

export function ConsentPanel({ requestId }: { requestId: string }) {
  const { user, loading, refresh } = useAuth();
  const [result, setResult] = useState<{
    requestId: string;
    data?: Consent;
    error?: string;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestId,
    );

  useEffect(() => {
    if (!user || !valid) return;
    const controller = new AbortController();
    apiFetch<Consent>(`/mcp/authorizations/${requestId}`, {
      signal: controller.signal,
    })
      .then((data) => setResult({ requestId, data }))
      .catch((err) => {
        if (!controller.signal.aborted)
          setResult({
            requestId,
            error:
              err instanceof ApiError && err.status === 403
                ? "Chỉ tài khoản người dùng đã xác minh và đang hoạt động được cấp quyền."
                : "Yêu cầu đã hết hạn hoặc không còn hợp lệ. Hãy kết nối lại từ ứng dụng AI.",
          });
      });
    return () => controller.abort();
  }, [requestId, user, valid]);

  async function decide(allow: boolean) {
    setPending(true);
    setError("");
    try {
      const result = await apiFetch<{ redirectUrl: string }>(
        `/mcp/authorizations/${requestId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allow }),
        },
      );
      window.location.assign(result.redirectUrl);
    } catch {
      setError(
        "Chưa hoàn tất được yêu cầu. Nếu quyền đã được xử lý, hãy bắt đầu kết nối lại từ ứng dụng AI.",
      );
      setPending(false);
    }
  }

  if (!valid)
    return (
      <ErrorState message="Đường dẫn cấp quyền không hợp lệ. Hãy kết nối từ ứng dụng AI." />
    );
  if (loading) return <LoadingState message="Đang kiểm tra đăng nhập…" />;
  if (!user)
    return (
      <Card className="mcp-consent form-stack">
        <h1>Đăng nhập để xem yêu cầu cấp quyền</h1>
        <p>
          Mở trang đăng nhập, sau đó quay lại tab này để kiểm tra và quyết định
          cấp quyền.
        </p>
        <Link
          className="button button-primary"
          href="/dang-nhap"
          target="_blank"
          rel="noopener noreferrer"
        >
          Đăng nhập Roomora ↗
        </Link>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError("");
            try {
              await refresh();
            } catch {
              setError("Chưa kiểm tra được phiên đăng nhập. Hãy thử lại.");
            } finally {
              setPending(false);
            }
          }}
        >
          Đã đăng nhập · Kiểm tra lại
        </Button>
        {error && <ErrorState message={error} />}
      </Card>
    );
  if (!result || result.requestId !== requestId)
    return <LoadingState message="Đang tải yêu cầu cấp quyền…" />;
  if (!result.data) return <ErrorState message={result.error!} />;
  return (
    <Card className="mcp-consent form-stack">
      <p className="eyebrow">Kết nối ứng dụng AI</p>
      <h1>Cho phép {result.data.clientName} tra cứu tin?</h1>
      <p>
        Đang đăng nhập bằng <strong>{user.email}</strong>.
      </p>
      <p>
        Ứng dụng được tìm và đọc các tin công khai trên Roomora. Quyền này không
        cho phép đăng tin, sửa dữ liệu hay đọc hồ sơ riêng.
      </p>
      <p className="text-muted">
        Tên ứng dụng do bên kết nối tự khai báo. Địa chỉ nhận quyền:{" "}
        <strong>{result.data.callbackOrigin}</strong>. Chỉ tiếp tục nếu bạn vừa
        yêu cầu kết nối ứng dụng này.
      </p>
      <p>
        Bạn có thể thu hồi trong{" "}
        <Link href="/tai-khoan/cai-dat">Cài đặt tài khoản</Link>. Đăng xuất
        phiên này cũng làm kết nối hết hiệu lực.
      </p>
      <p className="text-muted text-sm">
        Yêu cầu hết hạn lúc{" "}
        {new Date(result.data.expiresAt).toLocaleTimeString("vi-VN")}.
      </p>
      {error && <ErrorState message={error} />}
      <div className="mcp-actions">
        <Button disabled={pending} onClick={() => void decide(true)}>
          {pending ? "Đang xử lý…" : "Cho phép tra cứu"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => void decide(false)}
        >
          Từ chối
        </Button>
      </div>
    </Card>
  );
}
