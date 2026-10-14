"use client";
import type { ReactNode } from "react";
import type { AiUsage } from "@/lib/ai";
import { ButtonLink, ErrorState } from "../ui";
export function AiPanel({
  title,
  detail,
  usage,
  error,
  pending,
  children,
  purchaseLink = true,
  sendDataNotice = true,
}: {
  title: string;
  detail: string;
  usage: AiUsage | null;
  error: string;
  pending: boolean;
  children: ReactNode;
  purchaseLink?: boolean;
  sendDataNotice?: boolean;
}) {
  return (
    <section className="ai-panel" aria-label={title} aria-busy={pending}>
      <div className="ai-panel-heading">
        <div className="ai-panel-title">
          <span className="ai-emblem" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path
                d="m14 4 2.6 7.4L24 14l-7.4 2.6L14 24l-2.6-7.4L4 14l7.4-2.6L14 4Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M25 3v6m-3-3h6m-2 17v6m-3-3h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <span className="ai-eyebrow">
              Roomora AI ·{" "}
              {usage && usage.freeRemaining > 0
                ? "Dùng thử miễn phí"
                : "Trợ lý của bạn"}
            </span>
            <h3>{title}</h3>
          </div>
        </div>
        {usage && (
          <span className="ai-remaining">Còn {usage.remaining} lượt</span>
        )}
      </div>
      {usage && (
        <div className="ai-credit-status">
          <div>
            <strong>
              {usage.freeRemaining > 0
                ? `Còn ${usage.freeRemaining}/${usage.freeTotal} lượt miễn phí đầu tiên`
                : usage.remaining > 0
                  ? `Còn ${usage.paidRemaining} lượt đã mua`
                  : "Bạn đã dùng hết lượt AI"}
            </strong>
            <p className="text-muted">
              {usage.freeRemaining > 0
                ? "Dùng thử một lần cho mỗi tài khoản."
                : "Gói 50 lượt không hết hạn. Yêu cầu AI lỗi không bị trừ lượt."}
            </p>
          </div>
          {purchaseLink && (
            <ButtonLink href="/dich-vu#goi-ai" variant="secondary">
              {usage.remaining > 0
                ? "Mua thêm lượt AI"
                : "Mua 50 lượt · 59.000đ"}{" "}
              →
            </ButtonLink>
          )}
        </div>
      )}
      <p className="text-muted">
        {detail}{" "}
        {sendDataNotice &&
          "Khi bấm tạo, dữ liệu này được gửi đến OpenAI. Hãy kiểm tra kết quả trước khi dùng."}
      </p>
      {usage && !usage.available && (
        <p role="status">
          AI chưa được bật. Các thao tác thủ công vẫn dùng được.
        </p>
      )}
      {error && <ErrorState message={error} />}
      {children}
    </section>
  );
}
