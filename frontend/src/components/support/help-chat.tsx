"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { supportError } from "@/lib/support";
import { useAuth } from "../auth-provider";
import { Button } from "../ui";

interface HelpReply {
  kind: "answer" | "handoff";
  answer: string;
  source?: { title: string; href: string };
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
      const reply = await apiFetch<HelpReply>("/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
        signal: controller.signal,
      });
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
        error instanceof ApiError && error.code === "CHAT_RATE_LIMITED"
          ? "Bạn gửi câu hỏi quá nhanh. Hãy đợi một phút trước khi thử lại."
          : "Trợ lý chưa trả lời được lúc này. Bạn có thể gửi yêu cầu hỗ trợ để ADMIN kiểm tra.";
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text,
          question,
          reply: { kind: "handoff", answer: text },
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
        className="help-chat-messages"
        role="log"
        aria-label="Hội thoại hỗ trợ"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!messages.length && (
          <div className="help-chat-welcome">
            <h3>Bạn cần hỗ trợ gì?</h3>
            <p>
              Tôi hướng dẫn về tài khoản, đăng/tìm tin, kết nối, nhà chung và
              dịch vụ Roomora. Những việc cần kiểm tra cụ thể sẽ chuyển sang hỗ
              trợ.
            </p>
            <div className="help-chat-examples">
              {examples.map((question) => (
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
            Đang tìm hướng dẫn phù hợp…
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
            placeholder="Bạn muốn hỏi gì về Roomora?"
            rows={2}
            maxLength={1600}
            disabled={pending}
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
            disabled={input.trim().length < 2 || pending}
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
