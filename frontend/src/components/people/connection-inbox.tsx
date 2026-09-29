"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-provider";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";
import { apiFetch } from "@/lib/api";
import {
  peopleError,
  type ConnectionsPage,
  type ConnectionTab,
  type Person,
} from "@/lib/people";
import {
  ConnectionActions,
  PersonAvatar,
  PersonDetails,
} from "./person-details";

const tabs: Record<ConnectionTab, string> = {
  received: "Đã nhận",
  sent: "Đã gửi",
  accepted: "Đã kết nối",
  blocked: "Đã chặn",
};
export function ConnectionInbox({
  initialTab = "received",
}: {
  initialTab?: ConnectionTab;
}) {
  const { user, loading } = useAuth();
  const panel = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ConnectionTab>(initialTab);
  const [page, setPage] = useState(1);
  const [refreshCount, setRefreshCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    requestKey: string;
    data?: ConnectionsPage;
    error?: string;
  }>({ requestKey: "" });
  const requestPath = `/connections?tab=${tab}&page=${page}`;
  const requestKey = `${requestPath}:${refreshCount}:${user?.id ?? ""}`;
  const isCurrentResult = result.requestKey === requestKey;
  const data = isCurrentResult ? result.data : undefined;
  const person = data?.items.find(
    (item): item is Person =>
      "connection" in item && item.userId === selectedUserId,
  );
  useEffect(() => {
    if (selectedUserId)
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedUserId]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    apiFetch<ConnectionsPage>(requestPath, { signal: controller.signal })
      .then((data) => {
        if (page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
        else setResult({ requestKey, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ requestKey, error: peopleError(error) });
      });
    return () => controller.abort();
  }, [requestPath, requestKey, user, page]);
  function handleChange(message: string) {
    setNotice(message);
    setRefreshCount((value) => value + 1);
  }
  async function unblock(id: string) {
    setPending(true);
    setError("");
    try {
      await apiFetch(`/user-safety/${id}/block`, { method: "DELETE" });
      handleChange(
        "Đã bỏ chặn. Lời mời và kết nối cũ không được tự khôi phục.",
      );
    } catch (error) {
      setError(peopleError(error));
    } finally {
      setPending(false);
    }
  }
  if (loading)
    return (
      <section className="container page-section">
        <LoadingState />
      </section>
    );
  if (!user)
    return (
      <section className="container page-section narrow">
        <EmptyState
          title="Đăng nhập để xem yêu cầu kết nối"
          action={<ButtonLink href="/dang-nhap">Đăng nhập</ButtonLink>}
        >
          <p>Quản lý lời mời và những người bạn cùng nhà đã kết nối.</p>
        </EmptyState>
      </section>
    );
  return (
    <section className="container page-section people-page">
      <div className="people-page-heading">
        <div>
          <span className="eyebrow">KẾT NỐI ROOMORA</span>
          <h1>Yêu cầu kết nối</h1>
          <p className="text-muted">
            Xem đối chiếu nếp sống trước khi nhận lời kết nối.
          </p>
        </div>
        <ButtonLink href="/tim-nguoi-o-ghep" variant="secondary">
          Tìm người ở ghép →
        </ButtonLink>
      </div>
      <p className="listing-privacy">
        Không công khai email hoặc thông tin tài khoản của hai bên. Chấp nhận
        kết nối chỉ ghi nhận sự đồng thuận; hãy trao đổi cẩn thận trước khi ở
        chung.
      </p>
      <nav className="connection-tabs" aria-label="Danh sách kết nối">
        {Object.entries(tabs).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "primary" : "secondary"}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => {
              setTab(value as ConnectionTab);
              setPage(1);
              setSelectedUserId("");
              setError("");
            }}
          >
            {label}
            {data ? ` (${data.counts[value as ConnectionTab]})` : ""}
          </Button>
        ))}
        <Button
          variant="secondary"
          onClick={() => setRefreshCount((value) => value + 1)}
        >
          Làm mới
        </Button>
      </nav>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorState message={error} />}
      {!isCurrentResult ? (
        <LoadingState />
      ) : result.error ? (
        <ErrorState message={result.error} />
      ) : data?.items.length === 0 ? (
        <EmptyState
          title={
            tab === "blocked"
              ? "Bạn chưa chặn ai"
              : "Chưa có yêu cầu trong danh sách này"
          }
        >
          <p>
            {tab === "received"
              ? "Lời mời mới sẽ xuất hiện ở đây."
              : "Bạn có thể tìm người phù hợp và gửi lời kết nối."}
          </p>
        </EmptyState>
      ) : (
        <div className="people-results">
          <div className="people-list">
            {data?.items.map((item) => (
              <Card className="connection-card" key={item.userId}>
                {"connection" in item ? (
                  <>
                    <div className="person-identity">
                      <PersonAvatar person={item} />
                      <div>
                        <h2>{item.displayName}</h2>
                        <p className="text-muted text-sm">
                          {item.connection
                            ? new Date(
                                item.connection.createdAt,
                              ).toLocaleDateString("vi-VN")
                            : ""}
                        </p>
                      </div>
                    </div>
                    {item.connection?.message && (
                      <blockquote>{item.connection.message}</blockquote>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => setSelectedUserId(item.userId)}
                      aria-label={`Xem đối chiếu ${item.displayName}`}
                    >
                      Xem đối chiếu nếp sống
                    </Button>
                    <ConnectionActions person={item} onChange={handleChange} />
                  </>
                ) : (
                  <>
                    <h2>{item.displayName}</h2>
                    <p className="text-muted">
                      Đã chặn ngày{" "}
                      {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                    </p>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => unblock(item.userId)}
                    >
                      Bỏ chặn
                    </Button>
                  </>
                )}
              </Card>
            ))}
          </div>
          <div ref={panel} className="people-detail-panel">
            {person ? (
              <PersonDetails
                key={person.userId}
                person={person}
                onChange={handleChange}
              />
            ) : (
              <Card className="people-panel-empty">
                <span aria-hidden="true">♡</span>
                <h3>Chọn kết nối phù hợp</h3>
                <p className="text-muted">
                  Mở đối chiếu để xem những điểm phù hợp và khác biệt. Chặn sẽ
                  hủy cả lời mời lẫn kết nối đang có.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="people-pagination" aria-label="Phân trang kết nối">
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
              setSelectedUserId("");
            }}
          >
            ← Trang trước
          </Button>
          <span>
            Trang {page}/{data.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.pages}
            onClick={() => {
              setPage(page + 1);
              setSelectedUserId("");
            }}
          >
            Trang sau →
          </Button>
        </nav>
      )}
    </section>
  );
}
