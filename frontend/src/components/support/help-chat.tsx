"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { supportError } from "@/lib/support";
import { useAuth } from "../auth-provider";
import { Button } from "../ui";

interface HelpReply {
  kind: "answer" | "handoff" | "lookup";
  answer: string;
  source?: { title: string; href: string };
  items?: {
    id: string;
    title: string;
    rent: number | null;
    priceUnit: string;
    provinceName: string;
    wardName: string | null;
    isFull: boolean;
  }[];
  searchHref?: string;
}
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  question?: string;
  reply?: HelpReply;
}

const examples = [
  "Làm thế nào để đăng tin trên Roomora?",
  "Tôi quên mật khẩu",
  "Tôi muốn tìm người ở ghép thì bắt đầu từ đâu?",
];

export function HelpChat() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"help" | "lookup">("help");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<ChatMessage | null>(null);
  const [supportBody, setSupportBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const supportRef = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages, pending]);
  useEffect(() => {
    if (handoff) supportRef.current?.focus();
  }, [handoff]);

  async function ask() {
    const question = input.trim();
    if (question.length < 2 || pending || submitting) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    setInput("");
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: question },
    ]);
    try {
      const reply = await apiFetch<HelpReply>(
        mode === "lookup" ? "/support/chat/listings" : "/support/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question }),
          signal: controller.signal,
        },
      );
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: reply.answer,
          question,
          reply,
        },
      ]);
    } catch (error) {
      if (controller.signal.aborted) return;
      const text =
        mode === "lookup"
          ? error instanceof ApiError &&
            (error.status === 401 || error.status === 403)
            ? "Bạn cần đăng nhập bằng tài khoản người dùng đã xác minh để tra cứu tin."
            : "Chưa tra cứu được lúc này. Hãy thử lại sau hoặc dùng trang Tìm phòng."
          : error instanceof ApiError && error.code === "CHAT_RATE_LIMITED"
            ? "Bạn gửi câu hỏi quá nhanh. Hãy đợi một phút trước khi thử lại."
            : "Trợ lý chưa trả lời được lúc này. Bạn có thể gửi yêu cầu hỗ trợ để ADMIN kiểm tra.";
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text,
          question,
          reply:
            mode === "lookup"
              ? { kind: "lookup", answer: text, searchHref: "/tim-phong" }
              : { kind: "handoff", answer: text },
        },
      ]);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function reviewSupport(message: ChatMessage) {
    setHandoff(message);
    setSupportBody(`Câu hỏi từ trợ lý Roomora:\n${message.question || ""}`);
    setError("");
  }

  async function sendSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handoff || !user || submitting) return;
    const controller = new AbortController();
    request.current = controller;
    setSubmitting(true);
    setError("");
    try {
      const ticket = await apiFetch<{ id: string }>("/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Hỗ trợ: ${handoff.question}`.slice(0, 150),
          body: supportBody.trim(),
        }),
        signal: controller.signal,
      });
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Đã gửi yêu cầu hỗ trợ. ADMIN sẽ tiếp nhận; bạn có thể theo dõi và bổ sung thông tin trong Yêu cầu hỗ trợ.",
          reply: {
            kind: "answer",
            answer: "",
            source: {
              title: "Xem yêu cầu đã gửi",
              href: `/ho-tro?ticket=${ticket.id}`,
            },
          },
        },
      ]);
      setHandoff(null);
      window.dispatchEvent(new Event("roomora:admin-change"));
    } catch (error) {
      if (!controller.signal.aborted) setError(supportError(error));
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  return (
    <div className="help-chat">
      <div
        className="mcp-actions help-chat-modes"
        role="group"
        aria-label="Chế độ trợ lý"
      >
        <Button
          variant={mode === "help" ? "primary" : "secondary"}
          aria-pressed={mode === "help"}
          disabled={pending || !!handoff}
          onClick={() => setMode("help")}
        >
          Hướng dẫn
        </Button>
        <Button
          variant={mode === "lookup" ? "primary" : "secondary"}
          aria-pressed={mode === "lookup"}
          disabled={pending || !!handoff}
          onClick={() => setMode("lookup")}
        >
          Tìm tin
        </Button>
      </div>
      {mode === "lookup" && (
        <p className="text-muted text-sm help-chat-lookup-note">
          Tra cứu tin công khai, không dùng lượt AI trả phí. Nhập theo mẫu bên
          dưới; dùng bộ lọc tìm phòng cho tiêu chí khác.
          {!user && (
            <>
              {" "}
              <Link href="/dang-nhap">Đăng nhập để tra cứu</Link>.
            </>
          )}
        </p>
      )}
      <div
        className="help-chat-messages"
        role="log"
        aria-label="Hội thoại hỗ trợ"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!messages.length && (
          <div className="help-chat-welcome">
            <h3>
              {mode === "lookup"
                ? "Bạn muốn tìm phòng ở đâu?"
                : "Bạn cần hỗ trợ gì?"}
            </h3>
            <p>
              {mode === "lookup"
                ? "Tìm theo tỉnh/thành phố và giá tối đa. Những điều kiện chưa nhận diện được sẽ được hỏi lại."
                : "Tôi hướng dẫn về tài khoản, đăng/tìm tin, kết nối, nhà chung và dịch vụ Roomora. Những việc cần kiểm tra cụ thể sẽ chuyển sang hỗ trợ."}
            </p>
            <div className="help-chat-examples">
              {(mode === "lookup"
                ? [
                    "Tìm phòng tại Hà Nội dưới 4 triệu",
                    "Tìm ở ghép tại Đà Nẵng",
                  ]
                : examples
              ).map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => {
                    setInput(question);
                    inputRef.current?.focus();
                  }}
                >
                  {question}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M7 17 17 7M7 7h10v10" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`help-chat-message ${message.role === "user" ? "is-user" : ""}`}
          >
            <small>{message.role === "user" ? "Bạn" : "Trợ lý Roomora"}</small>
            <p>{message.text}</p>
            {!!message.reply?.items?.length && (
              <ul className="help-chat-listings">
                {message.reply.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="help-chat-source"
                      href={`/phong/${item.id}`}
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm">
                      {item.rent === null
                        ? "Giá thỏa thuận"
                        : `${item.rent.toLocaleString("vi-VN")} ${item.priceUnit}`}{" "}
                      ·{" "}
                      {[item.wardName, item.provinceName]
                        .filter(Boolean)
                        .join(", ")}
                      {item.isFull ? " · Đã đủ người" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {message.reply?.searchHref && (
              <Link
                className="help-chat-source"
                href={message.reply.searchHref}
              >
                Mở bộ lọc tìm phòng →
              </Link>
            )}
            {message.reply?.source && (
              <Link
                className="help-chat-source"
                href={message.reply.source.href}
              >
                {message.reply.source.title} →
              </Link>
            )}
            {message.reply?.kind === "handoff" &&
              (user ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || submitting}
                  onClick={() => reviewSupport(message)}
                >
                  Gửi yêu cầu cho ADMIN
                </Button>
              ) : (
                <Link className="help-chat-source" href="/ho-tro">
                  Đăng nhập để gửi yêu cầu hỗ trợ →
                </Link>
              ))}
          </article>
        ))}
        {pending && (
          <p className="help-chat-thinking" role="status">
            {mode === "lookup"
              ? "Đang tra cứu tin công khai…"
              : "Đang tìm hướng dẫn phù hợp…"}
          </p>
        )}
        <div ref={end} />
      </div>
      {error && (
        <p className="help-chat-error" role="alert">
          {error}
        </p>
      )}
      {handoff ? (
        <form className="help-chat-handoff" onSubmit={sendSupport}>
          <label htmlFor="help-support-body">Nội dung gửi ADMIN</label>
          <textarea
            id="help-support-body"
            ref={supportRef}
            value={supportBody}
            onChange={(event) => setSupportBody(event.target.value)}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            disabled={submitting}
          />
          <p>Bạn có thể bổ sung chi tiết trước khi gửi.</p>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Đang gửi…" : "Xác nhận gửi"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setHandoff(null);
                setError("");
              }}
            >
              Hủy
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="help-chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <label className="sr-only" htmlFor="help-chat-input">
            Câu hỏi về Roomora
          </label>
          <textarea
            id="help-chat-input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              mode === "lookup"
                ? "Tìm phòng tại Hà Nội dưới 4 triệu"
                : "Bạn muốn hỏi gì về Roomora?"
            }
            rows={2}
            maxLength={mode === "lookup" ? 500 : 1600}
            disabled={pending || (mode === "lookup" && !user)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          <button
            className="help-chat-send"
            type="submit"
            disabled={
              input.trim().length < 2 || pending || (mode === "lookup" && !user)
            }
            aria-label="Gửi câu hỏi"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20V4m-7 7 7-7 7 7" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
