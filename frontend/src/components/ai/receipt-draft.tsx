"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { ReceiptDraft } from "@/lib/ai";
import { categories } from "@/lib/household";
import { Button, Input, Select } from "../ui";
import { AiPanel } from "./ai-panel";
import { useAi } from "./use-ai";
function ReceiptReview({
  draft,
  onApply,
}: {
  draft: ReceiptDraft;
  onApply: (draft: ReceiptDraft) => void;
}) {
  const [title, setTitle] = useState(draft.title ?? "");
  const [amount, setAmount] = useState(
    draft.amount === null ? "" : String(draft.amount),
  );
  const [spentOn, setSpentOn] = useState(draft.spentOn ?? "");
  const [category, setCategory] = useState(draft.category ?? "");
  return (
    <div className="form-stack">
      <h4>Đối chiếu bản nháp với ảnh biên nhận</h4>
      <Input
        id="ai-receipt-title"
        label="Tên khoản chi"
        value={title}
        maxLength={150}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Input
        id="ai-receipt-amount"
        label="Tổng tiền (VNĐ)"
        type="number"
        min={1}
        max={2000000000}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        id="ai-receipt-date"
        label="Ngày phát sinh"
        type="date"
        value={spentOn}
        onChange={(e) => setSpentOn(e.target.value)}
      />
      <Select
        id="ai-receipt-category"
        label="Danh mục"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">Chưa xác định</option>
        {Object.entries(categories).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      {draft.warnings.length > 0 && (
        <ul>
          {draft.warnings.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        disabled={
          !title.trim() ||
          !amount ||
          !Number.isInteger(Number(amount)) ||
          Number(amount) < 1 ||
          Number(amount) > 2000000000 ||
          !spentOn ||
          !category
        }
        onClick={() =>
          onApply({
            title: title.trim(),
            amount: Number(amount),
            spentOn,
            category,
            warnings: [],
          })
        }
      >
        Điền bản nháp vào form
      </Button>
      <p className="text-muted">
        Chọn và xác nhận người trả, tình trạng thanh toán và cách chia trong
        form bên dưới. AI chỉ điền bốn trường trên.
      </p>
    </div>
  );
}
export function ReceiptDraftAssistant({
  houseId,
  onApply,
}: {
  houseId: string;
  onApply: (draft: ReceiptDraft) => void;
}) {
  const ai = useAi<ReceiptDraft>();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  return (
    <AiPanel
      title="Đọc biên nhận bằng AI"
      detail="Ảnh chỉ dùng để đề xuất khoản chi; chưa lưu vào sổ hoặc xác nhận đã trả tiền."
      {...ai}
    >
      <Input
        id="ai-receipt-file"
        label="Ảnh biên nhận (JPG, PNG, WebP; tối đa 5 MB)"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={ai.pending}
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          setFile(selected);
          setPreviewUrl(
            selected &&
              selected.size <= 5 * 1024 * 1024 &&
              ["image/jpeg", "image/png", "image/webp"].includes(selected.type)
              ? URL.createObjectURL(selected)
              : "",
          );
          ai.clear();
        }}
      />
      {previewUrl && (
        <Image
          className="ai-receipt-image"
          src={previewUrl}
          width={900}
          height={900}
          unoptimized
          alt="Biên nhận đã chọn để đối chiếu với bản nháp"
        />
      )}
      <Button
        variant="secondary"
        disabled={ai.pending || !file || file.size > 5 * 1024 * 1024}
        onClick={() => {
          if (!file) return;
          const body = new FormData();
          body.set("houseId", houseId);
          body.set("receipt", file);
          void ai.run("receipt-draft", body);
        }}
      >
        {ai.pending ? "Đang đọc…" : "Tạo bản nháp từ ảnh"}
      </Button>
      {file && file.size > 5 * 1024 * 1024 && (
        <p role="alert">Ảnh vượt quá 5 MB.</p>
      )}
      {ai.result && (
        <ReceiptReview
          key={JSON.stringify(ai.result)}
          draft={ai.result}
          onApply={onApply}
        />
      )}
    </AiPanel>
  );
}
