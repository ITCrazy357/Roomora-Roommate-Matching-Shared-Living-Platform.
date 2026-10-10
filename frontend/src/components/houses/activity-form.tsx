"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { householdError, type Activity } from "@/lib/household";
import type { Participant } from "@/lib/expenses";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
import { vietnamDate } from "./repayment-promise-form";

export function ActivityForm({
  path,
  shopping,
  people,
  activity,
  userId,
  onSaved,
  onCancel,
}: {
  path: string;
  shopping: boolean;
  people: Participant[];
  activity?: Activity;
  userId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(activity?.title ?? "");
  const [note, setNote] = useState(activity?.note ?? "");
  const [quantity, setQuantity] = useState(activity?.quantity ?? "");
  const [assigneeId, setAssigneeId] = useState(
    activity?.assigneeId ?? (shopping ? "" : userId),
  );
  const [dueOn, setDueOn] = useState(
    activity?.dueOn?.slice(0, 10) ?? (shopping ? "" : vietnamDate()),
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ body: string; clientId: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const input = {
      title: title.trim(),
      note: note.trim(),
      quantity: quantity.trim(),
      assigneeId: assigneeId || null,
      dueOn: dueOn || null,
      ...(activity ? { version: activity.version } : {}),
    };
    const body = JSON.stringify(input);
    if (!retry.current || retry.current.body !== body)
      retry.current = {
        body,
        clientId: activity?.clientId ?? crypto.randomUUID(),
      };
    setPending(true);
    setError("");
    try {
      await apiFetch(`${path}${activity ? `/${activity.id}` : ""}`, {
        method: activity ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, clientId: retry.current.clientId }),
      });
      onSaved();
    } catch (error) {
      setError(householdError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form" onSubmit={submit}>
      <h2>
        {activity
          ? "Chỉnh sửa"
          : shopping
            ? "Thêm món cần mua"
            : "Thêm việc nhà"}
      </h2>
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending}>
        <Input
          id="activity-title"
          label={shopping ? "Món cần mua" : "Tên việc"}
          required
          maxLength={150}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        {shopping && (
          <Input
            id="activity-quantity"
            label="Số lượng (ví dụ: 2 chai)"
            maxLength={100}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        )}
        <div className="form-grid">
          <Select
            id="activity-assignee"
            label={shopping ? "Người phụ trách mua" : "Người thực hiện"}
            required={!shopping}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">
              {shopping ? "Chưa phân công" : "Chọn người thực hiện"}
            </option>
            {people
              .filter((p) => !p.leftAt)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                  {p.isGuest ? " · Ngoài app" : ""}
                </option>
              ))}
          </Select>
          <Input
            id="activity-due"
            label={shopping ? "Ngày cần mua (tùy chọn)" : "Hạn hoàn thành"}
            type="date"
            required={!shopping}
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
          />
        </div>
        <Textarea
          id="activity-note"
          label="Ghi chú"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </fieldset>
      <div className="finance-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
