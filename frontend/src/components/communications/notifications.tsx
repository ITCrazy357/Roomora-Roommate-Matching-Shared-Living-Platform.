"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  communicationError,
  formatTime,
  post,
  type Notice,
  type Page,
} from "@/lib/communications";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";
import { useUpdates } from "./updates-provider";
import { CommunicationAccess } from "./access";
import { Pagination } from "./pagination";

const labels = {
  CONNECTION: "Kết nối",
  MESSAGE: "Tin nhắn",
  APPOINTMENT: "Lịch hẹn",
};
export function Notifications() {
  return (
    <CommunicationAccess>
      <NotificationsContent />
    </CommunicationAccess>
  );
}
function NotificationsContent() {
  const { revision } = useUpdates();
  const [data, setData] = useState<Page<Notice> | null>(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Page<Notice>>(
      `/notifications?page=${page}&tab=${tab}${type ? "&type=" + type : ""}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setData(data);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(communicationError(error));
        }
      });
    return () => controller.abort();
  }, [revision, page, tab, type, refresh]);
  async function read(id?: string) {
    setPending(true);
    setError("");
    try {
      await post(id ? `/notifications/${id}/read` : "/notifications/read");
      setRefresh((value) => value + 1);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="container communication-section">
      <div className="communication-title">
        <div>
          <span className="eyebrow">Luôn giữ liên lạc</span>
          <h1>Thông báo của bạn.</h1>
          <p className="text-muted">
            Lời mời kết nối, tin nhắn mới và thay đổi lịch hẹn tại một nơi.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={pending || !data?.unread}
          onClick={() => read()}
        >
          Đánh dấu tất cả đã đọc
        </Button>
      </div>
      <div className="notifications-layout">
        <div>
          <div className="communication-tabs">
            <button
              aria-pressed={tab === "all"}
              onClick={() => {
                setData(null);
                setTab("all");
                setPage(1);
              }}
            >
              Tất cả
            </button>
            <button
              aria-pressed={tab === "unread"}
              onClick={() => {
                setData(null);
                setTab("unread");
                setPage(1);
              }}
            >
              Chưa đọc ({data?.unread ?? 0})
            </button>
          </div>
          <div className="communication-tabs">
            <button
              aria-pressed={!type}
              onClick={() => {
                setData(null);
                setType("");
                setPage(1);
              }}
            >
              Mọi hoạt động
            </button>
            {Object.entries(labels).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={type === value}
                onClick={() => {
                  setData(null);
                  setType(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <ErrorState
              message={error}
              action={
                <Button onClick={() => setRefresh((value) => value + 1)}>
                  Thử lại
                </Button>
              }
            />
          )}
          {!data && !error && <LoadingState />}
          {data && !data.items.length && (
            <EmptyState title="Bạn đã cập nhật mọi thông tin">
              <p>Thông báo mới sẽ xuất hiện tại đây khi có hoạt động.</p>
            </EmptyState>
          )}
          <div className="notification-list">
            {data?.items.map((item) => (
              <Card
                key={item.id}
                className={`notification-card ${!item.readAt ? "notification-unread" : ""}`}
              >
                <div className="communication-actions">
                  <Badge>{labels[item.type]}</Badge>
                  <small className="text-muted">
                    {formatTime(item.createdAt)}
                  </small>
                </div>
                <h2>{item.title}</h2>
                <div className="communication-actions">
                  <Link className="text-link" href={item.href}>
                    Xem chi tiết →
                  </Link>
                  {item.readAt ? (
                    <small className="text-muted">Đã đọc</small>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => read(item.id)}
                    >
                      Đánh dấu đã đọc
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {data && (
            <Pagination
              page={page}
              pages={data.pages}
              onChange={(value) => {
                setData(null);
                setPage(value);
              }}
            />
          )}
        </div>
        <aside>
          <Card className="viewing-safety">
            <h2>Bạn quyết định mỗi bước.</h2>
            <p>
              Đánh dấu đã đọc chỉ cập nhật thông báo. Để xác nhận hoặc hủy lịch
              hẹn, hãy mở chi tiết và thực hiện thao tác.
            </p>
          </Card>
          <Card className="notification-info">
            <h3>Email cần thiết</h3>
            <p className="text-muted">
              Roomora gửi email khi lời mời được chấp nhận hoặc lịch hẹn thay
              đổi. Tin nhắn mới được thông báo trong ứng dụng.
            </p>
          </Card>
        </aside>
      </div>
    </section>
  );
}
