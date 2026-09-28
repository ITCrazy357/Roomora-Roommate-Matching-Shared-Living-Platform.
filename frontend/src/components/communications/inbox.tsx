"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  communicationError,
  type Conversation,
  type Page,
} from "@/lib/communications";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from "../ui";
import { CommunicationAccess } from "./access";
import { useUpdates } from "./updates-provider";
import { MessageThread } from "./message-thread";
import { Pagination } from "./pagination";

export function Inbox({ id }: { id?: string }) {
  return (
    <CommunicationAccess>
      <InboxContent id={id} />
    </CommunicationAccess>
  );
}
function InboxContent({ id }: { id?: string }) {
  const { revision, messages } = useUpdates();
  const [data, setData] = useState<Page<Conversation> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Page<Conversation>>(`/conversations?page=${page}`, {
      signal: controller.signal,
    })
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
  }, [revision, page, refresh]);
  const visible =
    data?.items.filter(
      (item) =>
        item.person.displayName
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")) &&
        (!unreadOnly || !!item.unread),
    ) ?? [];
  return (
    <section className="container communication-section">
      <div className="communication-title">
        <div>
          <span className="eyebrow">Kết nối thành cuộc trò chuyện</span>
          <h1>Hộp thư của bạn.</h1>
        </div>
        <Link className="text-link" href="/lich-xem-phong">
          Lịch hẹn →
        </Link>
      </div>
      <div className={`inbox-layout ${id ? "inbox-selected" : ""}`}>
        <Card className="conversation-list">
          <h2>
            Hộp thư <span className="badge">{messages} chưa đọc</span>
          </h2>
          <Input
            id="conversation-search"
            label="Tìm trong trang hội thoại này"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên người bạn đang trao đổi"
          />
          <div className="communication-tabs">
            <button
              aria-pressed={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
            >
              Tất cả
            </button>
            <button
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly(true)}
            >
              Chưa đọc
            </button>
          </div>
          <Link className="connection-shortcut" href="/ket-noi">
            ↗ Yêu cầu kết nối
          </Link>
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
          {data && !visible.length && (
            <p className="text-muted">
              Chưa có hội thoại phù hợp. Chấp nhận kết nối để bắt đầu nhắn tin.
            </p>
          )}
          <nav aria-label="Danh sách hội thoại">
            {visible.map((item) => (
              <Link
                key={item.id}
                className="conversation-link"
                href={`/tin-nhan/${item.id}`}
                aria-current={id === item.id ? "page" : undefined}
              >
                <span className="conversation-avatar" aria-hidden="true">
                  {item.person.displayName.charAt(0)}
                </span>
                <span>
                  <strong>{item.person.displayName}</strong>
                  <small>
                    {item.lastMessage
                      ? item.lastMessage.text ||
                        (item.lastMessage.attachments.some((file) => file.kind === "AUDIO")
                          ? "Đã gửi ghi âm"
                          : "Đã gửi ảnh")
                      : "Hai bạn đã kết nối. Bắt đầu trò chuyện."}
                  </small>
                </span>
                {!!item.unread && <span className="badge">{item.unread}</span>}
              </Link>
            ))}
          </nav>
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
        </Card>
        {id ? (
          <MessageThread key={id} id={id} />
        ) : (
          <div className="inbox-empty">
            <EmptyState title="Chọn một cuộc trò chuyện">
              <p>
                Tin nhắn và lịch hẹn chỉ hiển thị cho hai người đã chấp nhận kết
                nối.
              </p>
              <Link className="text-link" href="/tim-nguoi-o-ghep">
                Tìm người ở ghép →
              </Link>
            </EmptyState>
          </div>
        )}
      </div>
    </section>
  );
}
