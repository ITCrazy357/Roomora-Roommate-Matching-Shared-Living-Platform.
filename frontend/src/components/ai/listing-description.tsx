"use client";
import { useState } from "react";
import { formInput, type ListingForm } from "@/lib/listing-form";
import { Button, Select, Textarea } from "../ui";
import { useAi } from "./use-ai";
import { AiPanel } from "./ai-panel";
export function ListingDescriptionAssistant({
  form,
  onApply,
}: {
  form: ListingForm;
  onApply: (text: string) => void;
}) {
  const ai = useAi<{ description: string }>();
  const [tone, setTone] = useState("CONCISE");
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? ai.result?.description ?? "";
  return (
    <AiPanel
      title="Gợi ý mô tả bằng AI"
      detail="Dùng thông tin công khai bạn đã nhập; địa chỉ riêng và tọa độ không được gửi."
      {...ai}
    >
      <div className="ai-actions">
        <Select
          id="ai-tone"
          label="Cách viết"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={ai.pending}
        >
          <option value="CONCISE">Ngắn gọn</option>
          <option value="FRIENDLY">Thân thiện</option>
        </Select>
        <Button
          variant="secondary"
          disabled={ai.pending}
          onClick={() => {
            setEdited(null);
            void ai.run("listing-description", {
              ...formInput(form),
              privateAddress: "",
              latitude: null,
              longitude: null,
              description: "",
              tone,
            });
          }}
        >
          {ai.pending ? "Đang viết…" : "Tạo mô tả"}
        </Button>
      </div>
      {ai.result && (
        <div className="form-stack">
          <Textarea
            id="ai-description-preview"
            label="Bản gợi ý — có thể sửa"
            rows={7}
            maxLength={3000}
            value={text}
            onChange={(e) => setEdited(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!text.trim()}
            onClick={() => onApply(text)}
          >
            Dùng mô tả này
          </Button>
          <p className="text-muted">
            Chỉ điền vào form. Bạn vẫn cần lưu hoặc gửi duyệt tin.
          </p>
        </div>
      )}
    </AiPanel>
  );
}
