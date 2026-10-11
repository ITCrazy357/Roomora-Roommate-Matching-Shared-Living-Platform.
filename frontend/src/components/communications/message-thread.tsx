"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FocusPanel } from "../focus-panel";
import Link from "next/link";
import Image from "next/image";
import { ApiError, apiFetch, apiUrl } from "@/lib/api";
import {
  communicationError,
  formatTime,
  post,
  type ConversationDetail,
  type Message,
} from "@/lib/communications";
import { useAuth } from "../auth-provider";
import { useTyping } from "./use-typing";
import { useUpdates } from "./updates-provider";
import { Button, Card, ErrorState, LoadingState } from "../ui";
import { AppointmentCard } from "./appointment-card";
import { AppointmentForm } from "./appointment-form";
import { AreaMap } from "../listings/area-map";
import { MessageMedia } from "./message-media";
import { MessageComposer } from "./message-composer";
import { MessageActions } from "./message-actions";

function mergeMessages(old: Message[], items: Message[]) {
  const rows = new Map(old.map((item) => [item.number, item]));
  for (const item of items) {
    const current = rows.get(item.number);
    if (!current || item.version >= current.version)
      rows.set(item.number, item);
  }
  return [...rows.values()].sort((a, b) => a.number - b.number);
}
function attachmentUrl(conversationId: string, attachmentId: string) {
  return apiUrl(`/conversations/${conversationId}/attachments/${attachmentId}`);
}
export function MessageThread({ id }: { id: string }) {
  const { user } = useAuth();
  const { revision, connected, typingByConversation } = useUpdates();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState("");
  const [viewingImage, setViewingImage] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loaded = useRef(false);
  const lastNumber = useRef(0);
  const oldestNumber = useRef(0);
  const history = useRef<HTMLDivElement>(null);
  const stayAtBottom = useRef(true);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const { updateTyping, stopTyping } = useTyping(id);
  function openImage(url: string) {
    setViewingImage(url);
    imageDialog.current?.showModal();
  }
  useEffect(() => {
    const dialog = imageDialog.current;
    const close = () => setViewingImage("");
    dialog?.addEventListener("close", close);
    return () => dialog?.removeEventListener("close", close);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const room = await apiFetch<ConversationDetail>(
          `/conversations/${id}`,
          { signal: controller.signal },
        );
        const firstLoad = !loaded.current;
        // Refresh loaded history too: edits and deletions keep their original number.
        let after = Math.max(0, oldestNumber.current - 1);
        let more = true;
        const items: Message[] = [];
        while (more && !controller.signal.aborted) {
          const query = firstLoad ? "" : `?after=${after}`;
          const page = await apiFetch<{ items: Message[]; hasMore: boolean }>(
            `/conversations/${id}/messages${query}`,
            { signal: controller.signal },
          );
          items.push(...page.items);
          if (firstLoad) {
            setHasOlder(page.hasMore);
            break;
          }
          more = page.hasMore;
          after = page.items.at(-1)?.number ?? after;
        }
        if (controller.signal.aborted) return;
        setDetail(room);
        setError("");
        loaded.current = true;
        if (items.length) {
          oldestNumber.current = oldestNumber.current
            ? Math.min(oldestNumber.current, items[0].number)
            : items[0].number;
          lastNumber.current = Math.max(
            lastNumber.current,
            items.at(-1)!.number,
          );
          setMessages((old) => mergeMessages(old, items));
        }
        if (
          document.visibilityState === "visible" &&
          lastNumber.current > room.readNumber
        )
          await post(`/conversations/${id}/read`, {
            number: lastNumber.current,
          });
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(communicationError(error));
        // Permission may have changed after a block: remove private data from view.
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status ?? 0)
        ) {
          setDetail(null);
          setMessages([]);
          loaded.current = false;
          lastNumber.current = 0;
          oldestNumber.current = 0;
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [id, revision, refresh]);

  const newestNumber = messages.at(-1)?.number;
  useEffect(() => {
    if (
      viewingImage &&
      !messages.some((message) =>
        message.attachments.some(
          (file) => attachmentUrl(id, file.id) === viewingImage,
        ),
      )
    )
      imageDialog.current?.close();
  }, [messages, viewingImage, id]);
  const peerTyping = typingByConversation[id] ?? false;
  useLayoutEffect(() => {
    if (stayAtBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [newestNumber, peerTyping]);
  async function older() {
    setLoadingOlder(true);
    try {
      const page = await apiFetch<{ items: Message[]; hasMore: boolean }>(
        `/conversations/${id}/messages?before=${messages[0].number}`,
      );
      setMessages((old) => mergeMessages(old, page.items));
      if (page.items.length) oldestNumber.current = page.items[0].number;
      setHasOlder(page.hasMore);
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setLoadingOlder(false);
    }
  }
  if (!detail)
    return (
      <Card className="message-loading">
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button onClick={() => setRefresh((value) => value + 1)}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <LoadingState message="Đang tải hội thoại…" />
        )}
      </Card>
    );
  return (
    <>
      <Card className="message-thread">
        <header className="message-heading">
          <div>
            <h2>{detail.person.displayName}</h2>
            <p className="text-muted">
              {connected
                ? "Đã kết nối · tin nhắn tự cập nhật"
                : "Đang kết nối lại…"}
            </p>
          </div>
          <Link className="text-link" href={`/ho-so/${detail.person.userId}`}>
            Hồ sơ →
          </Link>
        </header>
        <div
          className="message-history"
          ref={history}
          aria-label="Lịch sử tin nhắn"
          onScroll={(event) => {
            const box = event.currentTarget;
            stayAtBottom.current =
              box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          }}
        >
          {hasOlder && (
            <Button variant="secondary" disabled={loadingOlder} onClick={older}>
              {loadingOlder ? "Đang tải…" : "Tải tin nhắn cũ"}
            </Button>
          )}
          {!messages.length && (
            <p className="message-welcome">
              Hai bạn đã kết nối. Hãy bắt đầu bằng một lời chào và trao đổi về
              nếp sống.
            </p>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`message-bubble ${message.senderId === user?.id ? "message-own" : ""}`}
            >
              {message.deletedAt ? (
                <p className="message-deleted">Tin nhắn đã bị xóa</p>
              ) : (
                message.text && <p>{message.text}</p>
              )}
              {!!message.attachments.length && (
                <MessageMedia
                  path={`/conversations/${id}/attachments`}
                  files={message.attachments}
                  openImage={openImage}
                />
              )}
              <small>
                {formatTime(message.createdAt)}
                {message.senderId === user?.id && " · Đã gửi"}
                {!message.deletedAt && message.editedAt && " · Đã chỉnh sửa"}
              </small>
              {message.senderId === user?.id && (
                <MessageActions
                  conversationId={id}
                  message={message}
                  onChange={(saved) => {
                    setMessages((old) => mergeMessages(old, [saved]));
                    setRefresh((value) => value + 1);
                  }}
                />
              )}
            </article>
          ))}
          {typingByConversation[id] && (
            <div
              className="typing-indicator"
              role="status"
              aria-label={`${detail.person.displayName} đang nhập tin nhắn`}
            >
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
        </div>
        {error && <ErrorState message={error} />}
        <MessageComposer
          path={`/conversations/${id}/messages`}
          label={`Tin nhắn cho ${detail.person.displayName}`}
          onTyping={updateTyping}
          onBlur={stopTyping}
          shortcuts={
            <Button variant="secondary" onClick={() => setProposing(true)}>
              ＋ Đề xuất lịch hẹn
            </Button>
          }
          onSaved={(saved) => {
            stayAtBottom.current = true;
            setMessages((old) => mergeMessages(old, [saved]));
            setRefresh((value) => value + 1);
          }}
        />
        <dialog
          ref={imageDialog}
          className="message-image-dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget)
              imageDialog.current?.close();
          }}
        >
          <button
            type="button"
            aria-label="Đóng ảnh"
            onClick={() => imageDialog.current?.close()}
          >
            ×
          </button>
          {viewingImage && (
            <Image
              unoptimized
              src={viewingImage}
              alt="Ảnh trong hội thoại"
              width={1400}
              height={1000}
            />
          )}
        </dialog>
      </Card>
      <aside className="message-sidebar">
        <Card className="viewing-intro">
          <h2>Phòng & lịch hẹn</h2>
          <p className="text-muted">
            Cùng xem không gian và trao đổi trước khi quyết định ở ghép.
          </p>
          <Link className="text-link" href="/lich-xem-phong">
            Tất cả lịch hẹn →
          </Link>
        </Card>
        {proposing && (
          <FocusPanel className="card" label="Đề xuất lịch hẹn">
            <AppointmentForm
              conversationId={id}
              rooms={detail.listings}
              onDone={() => {
                setProposing(false);
                setRefresh((value) => value + 1);
              }}
              onCancel={() => setProposing(false)}
            />
          </FocusPanel>
        )}
        {detail.listings.map((room) => (
          <Card key={room.id} className="conversation-room">
            <small className="text-muted">
              {room.ownerId === user?.id
                ? "Tin phòng của bạn"
                : `Tin phòng của ${detail.person.displayName}`}
            </small>
            {room.photos[0] && (
              <Image
                unoptimized
                className="conversation-room-image"
                src={room.photos[0].url}
                alt={room.title}
                width={400}
                height={250}
                sizes="(max-width: 700px) 90vw, 340px"
              />
            )}
            <h3>{room.title}</h3>
            <p className="text-muted">
              {[room.wardName, room.provinceName].filter(Boolean).join(", ")}
            </p>
            {room.rent && (
              <strong>
                {new Intl.NumberFormat("vi-VN").format(room.rent)} đ/tháng
              </strong>
            )}
            <Link className="text-link" href={`/phong/${room.id}`}>
              Xem tin phòng →
            </Link>
            {room.latitude !== null && room.longitude !== null && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setOpenMapId(openMapId === room.id ? null : room.id)
                  }
                  aria-expanded={openMapId === room.id}
                >
                  {openMapId === room.id
                    ? "Ẩn bản đồ khu vực"
                    : "Xem bản đồ khu vực"}
                </Button>
                {openMapId === room.id && (
                  <FocusPanel label="Bản đồ khu vực phòng">
                    <AreaMap
                      latitude={room.latitude}
                      longitude={room.longitude}
                    />
                    <p className="text-muted">
                      Ghim chỉ thể hiện khu vực gần phòng (khoảng 1 km), không
                      phải địa chỉ chính xác.
                    </p>
                  </FocusPanel>
                )}
              </>
            )}
          </Card>
        ))}
        {!detail.listings.length && (
          <Card>
            <p className="text-muted">
              Chưa có tin phòng công khai. Hai bạn vẫn có thể đề xuất lịch gặp
              để trao đổi.
            </p>
          </Card>
        )}
        {detail.appointments.map((item) => (
          <AppointmentCard
            key={item.id}
            item={item}
            onChange={() => setRefresh((value) => value + 1)}
          />
        ))}
        <Card className="viewing-safety">
          <h3>Gặp gỡ an toàn</h3>
          <p>
            Nên hẹn ban ngày hoặc đi cùng bạn bè. Lịch hẹn không phải là đặt cọc
            giữ chỗ.
          </p>
        </Card>
      </aside>
    </>
  );
}
