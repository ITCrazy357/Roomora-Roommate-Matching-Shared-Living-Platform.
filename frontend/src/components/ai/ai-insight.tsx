"use client";
import type { AiInsight } from "@/lib/ai";
import { Button, Textarea } from "../ui";
import { AiPanel } from "./ai-panel";
import { useAi } from "./use-ai";
import { useState } from "react";
export function AiInsightPanel({
  kind,
  id,
  month,
}: {
  kind: "matching" | "summary";
  id: string;
  month?: string;
}) {
  const ai = useAi<AiInsight>();
  const [notes, setNotes] = useState<string | null>(null);
  const matching = kind === "matching";
  return (
    <AiPanel
      title={matching ? "Giải thích độ phù hợp" : "Tóm tắt chi tiêu bằng AI"}
      detail={
        matching
          ? "AI chọn điểm cần chú ý từ các tiêu chí đối chiếu được phép xem. Điểm vẫn do quy tắc Roomora tính."
          : "AI chọn điểm cần chú ý từ tổng và danh mục trong tháng. Không gửi tên thành viên hoặc dữ liệu công nợ cá nhân."
      }
      {...ai}
    >
      <Button
        variant="secondary"
        disabled={ai.pending}
        onClick={() => {
          setNotes(null);
          void ai.run(
            matching ? `people/${id}/explanation` : `houses/${id}/summary`,
            matching ? {} : { month },
          );
        }}
      >
        {ai.pending
          ? "Đang phân tích…"
          : matching
            ? "Xem giải thích"
            : "Tạo tóm tắt"}
      </Button>
      {ai.result && (
        <div className="form-stack" aria-live="polite">
          {matching && (
            <p>
              {ai.result.score === null
                ? "Chưa đủ thông tin để chấm điểm."
                : `Độ phù hợp: ${ai.result.score}%`}{" "}
              · Đã đối chiếu {ai.result.assessed}/{ai.result.total} tiêu chí.
            </p>
          )}
          <ul>
            {ai.result.highlights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          <p className="text-muted">{ai.result.notice}</p>
          {!matching && (
            <Textarea
              id="ai-summary-notes"
              label="Ghi chú cá nhân — có thể sửa, chưa lưu"
              rows={5}
              maxLength={5000}
              value={notes ?? ai.result.highlights.join("\n")}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </div>
      )}
    </AiPanel>
  );
}
