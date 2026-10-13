"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { adminError, adminTime, type AdminAction } from "@/lib/admin";
import { useUpdates } from "../communications/updates-provider";
import { Button, ErrorState, LoadingState } from "../ui";

export function useAdminPage<T>(path: string) {
  const { revision } = useUpdates();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>({ path: "" });
  useEffect(() => {
    const refresh = () => setRetry((old) => old + 1);
    window.addEventListener("roomora:admin-change", refresh);
    return () => window.removeEventListener("roomora:admin-change", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<T>(path, { signal: controller.signal })
      .then((data) => setResult({ path, data }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ path, error: adminError(error) });
      });
    return () => controller.abort();
  }, [path, retry, revision]);
  return {
    data: result.path === path ? result.data : undefined,
    error: result.path === path ? result.error : undefined,
    reload: () => setRetry((old) => old + 1),
  };
}

export function useAdminClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function AdminResult({
  error,
  reload,
}: {
  error?: string;
  reload: () => void;
}) {
  return error ? (
    <ErrorState
      message={error}
      action={
        <Button variant="secondary" onClick={reload}>
          Tải lại
        </Button>
      }
    />
  ) : (
    <LoadingState />
  );
}
export function AdminPagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (page > Math.max(1, pages))
    return (
      <Button variant="secondary" onClick={() => onPage(1)}>
        Danh sách đã thay đổi · Về trang đầu
      </Button>
    );
  if (pages <= 1) return null;
  return (
    <nav className="admin-pagination" aria-label="Phân trang">
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Trước
      </Button>
      <span>
        Trang {page} / {pages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Tiếp
      </Button>
    </nav>
  );
}
const actionNames: Record<string, string> = {
  LISTING_PUBLISHED: "Duyệt tin đăng",
  LISTING_REJECTED: "Từ chối tin đăng",
  ACCOUNT_CLOSED: "Người dùng đóng tài khoản",
  ACCOUNT_REOPENED: "Khôi phục theo yêu cầu người dùng",
  SUPPORT_IN_PROGRESS: "Tiếp nhận hỗ trợ",
  SUPPORT_WAITING_USER: "Yêu cầu bổ sung thông tin",
  SUPPORT_RESOLVED: "Giải quyết hỗ trợ",
  SUPPORT_CLOSED: "Đóng yêu cầu hỗ trợ",
  USER_LOCKED: "Khóa tài khoản",
  USER_UNLOCKED: "Mở khóa tài khoản",
  REPORT_RESOLVED: "Đã xử lý vi phạm",
  REPORT_DISMISSED: "Báo cáo không đủ căn cứ",
  ANNOUNCEMENT_CREATED: "Tạo bản nháp",
  ANNOUNCEMENT_UPDATED: "Sửa nội dung",
  ANNOUNCEMENT_PUBLISHED: "Phát thông báo",
  ANNOUNCEMENT_WITHDRAWN: "Gỡ thông báo",
};
export function AdminHistory({
  actions,
  showEntity = false,
}: {
  actions: AdminAction[];
  showEntity?: boolean;
}) {
  return (
    <div className="admin-history">
      <h3>Lịch sử thao tác</h3>
      {actions.length ? (
        <ol>
          {actions.map((action) => (
            <li key={action.id}>
              <strong>{actionNames[action.action] ?? action.action}</strong>
              <small>
                {adminTime(action.createdAt)} ·{" "}
                {action.actor.profile?.displayName ?? "Quản trị viên"}
              </small>
              {action.reason && <p>{action.reason}</p>}
              {showEntity && action.entityId && (
                <small>Mã đối tượng: {action.entityId}</small>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">Chưa có thao tác nào.</p>
      )}
    </div>
  );
}
