"use client";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FocusPanel } from "../focus-panel";
import { apiFetch } from "@/lib/api";
import { houseError } from "@/lib/houses";
import type { House } from "@/lib/houses";
import { PresenceStatus } from "../communications/presence-status";
import { formatTime } from "@/lib/communications";
import type { HouseMessage } from "@/lib/house-chat";
import { HousePollCard, HousePollForm } from "./house-poll";
import { useUpdates } from "../communications/updates-provider";
import { MessageActions } from "../communications/message-actions";
import { MessageComposer } from "../communications/message-composer";
import { MessageMedia } from "../communications/message-media";
import { Button, Card, ErrorState, LoadingState } from "../ui";
function merge(old: HouseMessage[], incoming: HouseMessage[]) {
  const rows = new Map(old.map((row) => [row.number, row]));
  for (const row of incoming)
    if (!rows.has(row.number) || rows.get(row.number)!.version <= row.version)
      rows.set(row.number, row);
  return [...rows.values()].sort((a, b) => a.number - b.number);
}
export function HouseChat({
  houseId,
  userId,
  members,
}: {
  houseId: string;
  userId: string;
  members: House["members"];
}) {
  const { revision, connected } = useUpdates();
  const [messages, setMessages] = useState<HouseMessage[] | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const oldest = useRef(0);
  const history = useRef<HTMLDivElement>(null);
  const stayAtBottom = useRef(true);
  const path = `/houses/${houseId}/messages`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const initial = oldest.current === 0;
        let after = Math.max(0, oldest.current - 1),
          more = true;
        const items: HouseMessage[] = [];
        while (more && !controller.signal.aborted) {
          const page = await apiFetch<{
            items: HouseMessage[];
            hasMore: boolean;
          }>(`${path}${initial ? "" : `?after=${after}`}`, {
            signal: controller.signal,
          });
          items.push(...page.items);
          if (initial) {
            setHasOlder(page.hasMore);
            break;
          }
          more = page.hasMore;
          after = page.items.at(-1)?.number ?? after;
        }
        if (controller.signal.aborted) return;
        if (items.length)
          oldest.current = oldest.current
            ? Math.min(oldest.current, items[0].number)
            : items[0].number;
        setMessages((old) => merge(old ?? [], items));
        setError("");
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessages(null);
          oldest.current = 0;
          setError(houseError(error));
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, revision, refresh]);
  const newest = messages?.at(-1)?.number;
  const peers = members.filter((member) => member.userId !== userId);
  useLayoutEffect(() => {
    if (stayAtBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [newest]);
  async function loadOlder() {
    if (!messages?.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await apiFetch<{ items: HouseMessage[]; hasMore: boolean }>(
        `${path}?before=${messages[0].number}`,
      );
      if (page.items.length) oldest.current = page.items[0].number;
      setMessages((old) => merge(old ?? [], page.items));
      setHasOlder(page.hasMore);
    } catch (error) {
      setSendError(houseError(error));
    } finally {
      setLoadingOlder(false);
    }
  }
  return (
    <Card className="house-panel house-chat">
      <h2>Chat chung trong nhà</h2>
      <p className="house-chat-subtitle text-muted">
        {members.length} thành viên
        {!connected && <span role="status"> · Đang kết nối lại…</span>}
      </p>
      {peers.length > 0 && (
        <details className="house-chat-members">
          <summary>Xem thành viên ({peers.length})</summary>
          <div
            className="house-chat-presence"
            aria-label="Trạng thái các thành viên khác trong nhà"
          >
            {peers.map((member) => (
              <div className="house-chat-member" key={member.userId}>
                <span className="house-avatar" aria-hidden="true">
                  {member.avatarUrl ? (
                    <Image
                      src={member.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                  ) : (
                    member.displayName.charAt(0)
                  )}
                </span>
                <span>
                  <strong>{member.displayName}</strong>
                  <PresenceStatus presence={member.presence} />
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
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
      {!messages && !error && <LoadingState />}
      {messages && (
        <>
          <div
            ref={history}
            className="message-history house-chat-history"
            onScroll={(event) => {
              const target = event.currentTarget;
              stayAtBottom.current =
                target.scrollHeight - target.scrollTop - target.clientHeight <
                80;
            }}
          >
            {hasOlder && (
              <Button
                variant="secondary"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
              >
                Tin nhắn cũ hơn
              </Button>
            )}
            {!messages.length && (
              <p className="message-welcome">
                Cùng trao đổi về việc nhà, chi phí và kế hoạch chung.
              </p>
            )}
            {messages.map((message) => (
              <article
                className={`message-bubble house-message ${message.senderId === userId ? "message-own" : ""}`}
                key={message.id}
              >
                {message.senderId !== userId && (
                  <div className="house-message-person">
                    <span className="house-avatar">
                      {message.sender.avatarUrl ? (
                        <Image
                          src={message.sender.avatarUrl}
                          width={32}
                          height={32}
                          alt=""
                          unoptimized
                        />
                      ) : (
                        message.sender.displayName.charAt(0)
                      )}
                    </span>
                    <div>
                      <strong>{message.sender.displayName}</strong>
                      <small>
                        {message.sender.role === "OWNER"
                          ? "Trưởng nhà"
                          : "Thành viên"}
                      </small>
                    </div>
                  </div>
                )}
                {message.deletedAt ? (
                  <p className="message-deleted">Tin nhắn đã bị xóa</p>
                ) : (
                  <>
                    {message.text && <p>{message.text}</p>}
                    {message.poll && (
                      <HousePollCard
                        houseId={houseId}
                        message={message}
                        canClose={message.senderId === userId}
                        onSaved={(row) =>
                          setMessages((old) => merge(old ?? [], [row]))
                        }
                      />
                    )}
                    <MessageMedia
                      path={`/houses/${houseId}/attachments`}
                      files={message.attachments}
                    />
                  </>
                )}
                <small>
                  {formatTime(message.createdAt)}
                  {!message.deletedAt && message.editedAt && " · Đã chỉnh sửa"}
                </small>
                {message.senderId === userId && (
                  <MessageActions
                    conversationId={houseId}
                    messagePath={path}
                    deletePrompt="Xóa tin nhắn này cho cả nhà? Tệp đính kèm và bình chọn trong tin cũng sẽ bị xóa."
                    message={message}
                    onChange={() => setRefresh((value) => value + 1)}
                  />
                )}
              </article>
            ))}
          </div>
          {sendError && <ErrorState message={sendError} />}
          {creatingPoll && (
            <FocusPanel label="Tạo cuộc bình chọn">
              <HousePollForm
                houseId={houseId}
                onCancel={() => setCreatingPoll(false)}
                onSaved={(row) => {
                  stayAtBottom.current = true;
                  setMessages((old) => merge(old ?? [], [row]));
                  setCreatingPoll(false);
                }}
              />
            </FocusPanel>
          )}
          <MessageComposer<HouseMessage>
            path={path}
            textId="house-chat-text"
            label="Tin nhắn cho cả nhà"
            onCreatePoll={() => setCreatingPoll(true)}
            onSaved={(row) => {
              stayAtBottom.current = true;
              setMessages((old) => merge(old ?? [], [row]));
              setRefresh((value) => value + 1);
            }}
          />
        </>
      )}
    </Card>
  );
}
