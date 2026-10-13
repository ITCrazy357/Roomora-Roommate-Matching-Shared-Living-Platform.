"use client";
import type { ReactNode } from "react";
import type { AiUsage } from "@/lib/ai";
import { ErrorState } from "../ui";
export function AiPanel({
  title,
  detail,
  usage,
  error,
  pending,
  children,
}: {
  title: string;
  detail: string;
  usage: AiUsage | null;
  error: string;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <section className="ai-panel" aria-label={title} aria-busy={pending}>
      <div className="ai-panel-heading">
        <h3>{title}</h3>
        {usage && (
          <span className="text-muted">
            {usage.used}/{usage.limit} lượt ·{" "}
            {usage.month.split("-").reverse().join("/")}
          </span>
        )}
      </div>
      <p className="text-muted">
        {detail} Khi bấm tạo, dữ liệu này được gửi đến OpenAI. Hãy kiểm tra kết
        quả trước khi dùng.
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
