"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { HelpChat } from "./support/help-chat";

function ChatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z" />
      <path d="M7 10h10M7 14h6" />
    </svg>
  );
}

function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  return (
    <div
      className="chat-widget"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }}
    >
      {mounted && (
        <section
          id="roomora-chat-panel"
          className="chat-widget-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="roomora-chat-title"
          hidden={!open}
        >
          <header className="chat-widget-heading">
            <span className="chat-widget-symbol">
              <ChatIcon />
            </span>
            <div>
              <h2 id="roomora-chat-title">Trợ lý Roomora</h2>
              <p>Hướng dẫn sử dụng và hỗ trợ</p>
            </div>
            <button
              ref={closeButton}
              type="button"
              className="chat-widget-close"
              onClick={close}
              aria-label="Đóng trợ lý"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>
          <div className="chat-widget-body">
            <HelpChat />
          </div>
          <footer className="chat-widget-footer">
            <Link href="/ho-tro" onClick={close}>
              Theo dõi yêu cầu hỗ trợ
            </Link>
          </footer>
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="chat-widget-launcher"
        aria-label={open ? "Thu gọn trợ lý Roomora" : "Mở trợ lý Roomora"}
        title={open ? "Thu gọn trợ lý Roomora" : "Mở trợ lý Roomora"}
        aria-expanded={open}
        aria-controls={mounted ? "roomora-chat-panel" : undefined}
        onClick={() => {
          if (open) close();
          else {
            setMounted(true);
            setOpen(true);
          }
        }}
      >
        <ChatIcon />
      </button>
    </div>
  );
}

export function ChatWidget() {
  const { user, loading } = useAuth();
  const path = usePathname();
  if (
    loading ||
    user?.role === "ADMIN" ||
    path === "/admin" ||
    path.startsWith("/admin/")
  )
    return null;
  return <ChatPanel key={user?.id || "guest"} />;
}
