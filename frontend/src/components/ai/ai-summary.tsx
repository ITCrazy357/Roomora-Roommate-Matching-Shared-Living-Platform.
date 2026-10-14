"use client";
import { memo, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { aiError, type AiSavedSummary } from "@/lib/ai";
import { Button, Textarea } from "../ui";
import { AiPanel } from "./ai-panel";
import { useAi } from "./use-ai";

export const AiSummaryPanel = memo(function AiSummaryPanel({
  houseId,
  month,
}: {
  houseId: string;
  month: string;
}) {
  const ai = useAi<AiSavedSummary>();
  const path = `/ai/houses/${houseId}/summary`;
  const [saved, setSaved] = useState<AiSavedSummary | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ summary: AiSavedSummary | null }>(`${path}?month=${month}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setSaved(result.summary);
        setError("");
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(aiError(error));
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [path, month, refresh]);
  const dirty = saved !== null && notes !== null && notes !== saved.notes;
  async function generate() {
    setNotice("");
    const result = await ai.run(`houses/${houseId}/summary`, {
      month,
      regenerate: !!saved,
    });
    if (result) {
      setSaved(result);
      setError("");
      setNotice("Đã lưu tóm tắt. Xem lại tháng này không tốn lượt AI.");
    }
  }
  async function saveNotes() {
    if (!saved || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch<AiSavedSummary>(`${path}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          notes: notes ?? saved.notes,
          version: saved.version,
        }),
      });
      setSaved(result);
      setNotes(null);
      setNotice("Đã lưu ghi chú cá nhân. Không trừ lượt AI.");
    } catch (error) {
      setError(
        error instanceof ApiError && error.code === "AI_SUMMARY_CHANGED"
          ? "Bản lưu đã thay đổi ở nơi khác. Tải lại bản lưu rồi kiểm tra ghi chú trước khi lưu tiếp."
          : aiError(error),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <AiPanel
      title="Tóm tắt chi tiêu bằng AI"
      detail="Tóm tắt và ghi chú lưu riêng cho bạn theo nhà và tháng. AI chỉ đọc tổng và danh mục; không gửi tên thành viên hoặc công nợ cá nhân."
      usage={ai.usage}
      error={error || ai.error}
      pending={loading || saving || ai.pending}
    >
      <div className="ai-actions">
        <p role="status">
          {loading
            ? "Đang tải bản tóm tắt đã lưu…"
            : saved
              ? `Bản đã lưu · Tháng ${month}`
              : `Tháng ${month} chưa có tóm tắt của bạn.`}
        </p>
        <Button
          variant="secondary"
          disabled={loading || saving || ai.pending || dirty || !!error}
          onClick={() => void generate()}
        >
          {ai.pending
            ? "Đang phân tích…"
            : saved
              ? "Tạo lại · 1 lượt AI"
              : "Tạo tóm tắt · 1 lượt AI"}
        </Button>
        {error && (
          <Button
            variant="secondary"
            disabled={saving || ai.pending}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Tải lại bản lưu
          </Button>
        )}
      </div>
      <p className="text-muted">
        Xem lại bản đã lưu miễn phí. Mỗi tháng chưa có bản lưu cần tạo riêng;
        tạo lại tốn 1 lượt AI.
      </p>
      {saved && (
        <div className="form-stack">
          <p className="text-muted">
            Đã lưu lúc{" "}
            {new Intl.DateTimeFormat("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(saved.generatedAt))}
            . Bản lưu không tự cập nhật khi khoản chi thay đổi.
          </p>
          <ul>
            {saved.highlights.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
          <p className="text-muted">{saved.notice}</p>
          <Textarea
            id="ai-summary-notes"
            label={`Ghi chú cá nhân — ${dirty ? "có thay đổi chưa lưu" : "đã lưu"}`}
            rows={5}
            maxLength={5000}
            value={notes ?? saved.notes}
            disabled={saving || ai.pending}
            onChange={(event) => {
              setNotes(event.target.value);
              setNotice("");
            }}
          />
          <div className="ai-actions">
            <Button
              variant="secondary"
              disabled={!dirty || saving || ai.pending}
              onClick={() => void saveNotes()}
            >
              {saving ? "Đang lưu…" : "Lưu ghi chú"}
            </Button>
            {dirty && (
              <p className="text-muted">
                Lưu ghi chú trước khi tạo lại tóm tắt.
              </p>
            )}
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </AiPanel>
  );
});
