"use client";
import type { AiInsight } from "@/lib/ai";
import { Button } from "../ui";
import { AiPanel } from "./ai-panel";
import { useAi } from "./use-ai";
import { AiSummaryPanel } from "./ai-summary";
export function AiInsightPanel({
  kind,
  id,
  month,
}: {
  kind: "matching" | "summary";
  id: string;
  month?: string;
}) {
  return kind === "summary" && month ? (
    <AiSummaryPanel houseId={id} month={month} />
  ) : (
    <AiMatchingPanel id={id} />
  );
}
function AiMatchingPanel({ id }: { id: string }) {
  const ai = useAi<AiInsight>();
  return (
    <AiPanel
      title="Giải thích độ phù hợp"
      detail="AI chọn điểm cần chú ý từ các tiêu chí đối chiếu được phép xem. Điểm vẫn do quy tắc Roomora tính."
      {...ai}
    >
      <Button
        variant="secondary"
        disabled={ai.pending}
        onClick={() => {
          void ai.run(`people/${id}/explanation`, {});
        }}
      >
        {ai.pending ? "Đang phân tích…" : "Xem giải thích"}
      </Button>
      {ai.result && (
        <div className="form-stack" aria-live="polite">
          <p>
            {ai.result.score === null
              ? "Chưa đủ thông tin để chấm điểm."
              : `Độ phù hợp: ${ai.result.score}%`}{" "}
            · Đã đối chiếu {ai.result.assessed}/{ai.result.total} tiêu chí.
          </p>
          <ul>
            {ai.result.highlights.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          <p className="text-muted">{ai.result.notice}</p>
        </div>
      )}
    </AiPanel>
  );
}
