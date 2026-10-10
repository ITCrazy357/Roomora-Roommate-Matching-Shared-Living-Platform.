"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import type { Participant } from "@/lib/expenses";
import {
  categories,
  householdError,
  type ExpenseCategory,
  type RecurringRule,
} from "@/lib/household";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
import { vietnamDate } from "./repayment-promise-form";

export function RecurringRuleForm({
  houseId,
  userId,
  people,
  rule,
  onSaved,
  onCancel,
}: {
  houseId: string;
  userId: string;
  people: Participant[];
  rule?: RecurringRule;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(rule?.title ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(
    rule?.category ?? "OTHER",
  );
  const [variable, setVariable] = useState(rule ? rule.amount === null : false);
  const [amount, setAmount] = useState(rule?.amount ? String(rule.amount) : "");
  const [payerId, setPayerId] = useState(rule?.payerId ?? userId);
  const [selected, setSelected] = useState(
    rule?.participantIds ?? people.filter((p) => !p.leftAt).map((p) => p.id),
  );
  const [day, setDay] = useState(
    rule?.dayOfMonth ?? Number(vietnamDate().slice(8)),
  );
  const [firstOn, setFirstOn] = useState(
    rule?.nextOn.slice(0, 10) ?? vietnamDate(),
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const retry = useRef<{ body: string; clientId: string } | null>(null);
  const active = people.filter((p) => !p.leftAt);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (
      !selected.length ||
      selected.some((id) => !active.some((p) => p.id === id))
    ) {
      setError("Chọn lại danh sách chia tiền gồm người hiện tại trong nhà.");
      return;
    }
    setPending(true);
    setError("");
    const input = {
      title: title.trim(),
      description: description.trim(),
      category,
      amount: variable ? null : Number(amount),
      payerId,
      participantIds: [...selected].sort(),
      dayOfMonth: day,
      firstOn,
      ...(rule ? { version: rule.version } : {}),
    };
    const body = JSON.stringify(input);
    if (!retry.current || retry.current.body !== body)
      retry.current = { body, clientId: rule?.clientId ?? crypto.randomUUID() };
    try {
      await apiFetch(
        `/houses/${houseId}/household/recurring${rule ? `/${rule.id}` : ""}`,
        {
          method: rule ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, clientId: retry.current.clientId }),
        },
      );
      onSaved();
    } catch (error) {
      setError(householdError(error));
    } finally {
      setPending(false);
    }
  }
  function changeDay(value: number) {
    setDay(value);
    if (value >= 1 && value <= 31) {
      const [year, month] = (firstOn || vietnamDate()).split("-").map(Number);
      const candidate = new Date(
        Date.UTC(
          year,
          month - 1,
          Math.min(value, new Date(Date.UTC(year, month, 0)).getUTCDate()),
        ),
      );
      if (candidate.toISOString().slice(0, 10) < vietnamDate())
        candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
      const last = new Date(
        Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0),
      ).getUTCDate();
      candidate.setUTCDate(Math.min(value, last));
      setFirstOn(candidate.toISOString().slice(0, 10));
    }
  }
  return (
    <form className="house-form" onSubmit={submit}>
      <h2>{rule ? "Sửa quy tắc định kỳ" : "Thêm quy tắc định kỳ"}</h2>
      <p className="text-muted">
        Lặp mỗi tháng; ngày 29–31 được chuyển về ngày cuối tháng ngắn. Nháp đã
        tạo giữ nguyên khi sửa quy tắc.
      </p>
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending}>
        <Input
          id="recurring-title"
          label="Tên khoản định kỳ"
          required
          maxLength={150}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="form-grid">
          <Select
            id="recurring-category"
            label="Danh mục"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as ExpenseCategory)
            }
          >
            {Object.entries(categories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            id="recurring-type"
            label="Loại khoản chi"
            value={variable ? "variable" : "fixed"}
            onChange={(event) => setVariable(event.target.value === "variable")}
          >
            <option value="fixed">Cố định · Điền sẵn số tiền</option>
            <option value="variable">Biến động · Nhập tiền khi xác nhận</option>
          </Select>
        </div>
        {!variable && (
          <Input
            id="recurring-amount"
            label="Số tiền mỗi tháng (VNĐ)"
            type="number"
            required
            min={1}
            max={2000000000}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
        <Select
          id="recurring-payer"
          label="Người phụ trách / dự kiến trả"
          value={payerId}
          required
          onChange={(event) => setPayerId(event.target.value)}
        >
          <option value="">Chọn người phụ trách</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
              {p.isGuest ? " · Ngoài app" : ""}
            </option>
          ))}
        </Select>
        <div className="form-grid">
          <Input
            id="recurring-day"
            label="Ngày trong tháng"
            type="number"
            required
            min={1}
            max={31}
            step={1}
            value={day || ""}
            onChange={(event) => changeDay(Number(event.target.value))}
          />
          <Input
            id="recurring-first"
            label="Ngày tạo nháp đầu / tiếp theo"
            type="date"
            required
            min={vietnamDate()}
            value={firstOn}
            onChange={(event) => setFirstOn(event.target.value)}
          />
        </div>
        <fieldset className="expense-members">
          <legend>Người chia dự kiến (quy tắc tháng được ưu tiên khi xác nhận)</legend>
          {people.map((p) => (
            <label className="house-check" key={p.id}>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                disabled={!!p.leftAt && !selected.includes(p.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, p.id]
                      : selected.filter((id) => id !== p.id),
                  )
                }
              />
              {p.displayName}
              {p.isGuest ? " · Ngoài app" : ""}
              {p.leftAt ? " · Đã rời, cần bỏ chọn" : ""}
            </label>
          ))}
        </fieldset>
        <Textarea
          id="recurring-note"
          label="Ghi chú"
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </fieldset>
      <div className="finance-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu quy tắc"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
