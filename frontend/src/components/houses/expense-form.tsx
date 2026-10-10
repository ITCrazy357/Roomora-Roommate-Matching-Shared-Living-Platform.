"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  expenseError,
  money,
  type Expense,
  type Participant,
} from "@/lib/expenses";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";

export function ExpenseForm({
  houseId,
  userId,
  participants,
  expense,
  onSaved,
  onCancel,
}: {
  houseId: string;
  userId: string;
  participants: Participant[];
  expense?: Expense;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(expense?.title ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [payerId, setPayerId] = useState(expense?.payerId ?? userId);
  const [splitMode, setSplitMode] = useState<"EQUAL" | "CUSTOM">(
    expense?.splitMode ?? "EQUAL",
  );
  const [selected, setSelected] = useState(
    expense?.splits.map((split) => split.participantId) ??
      participants
        .filter((person) => !person.leftAt)
        .map((person) => person.id),
  );
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(
      expense?.splits.map((split) => [
        split.participantId,
        String(split.amount),
      ]) ?? [],
    ),
  );
  const [reason, setReason] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Expense | null>(null);
  const draft = useRef<{ body: string; clientId: string } | null>(null);
  const people = participants.filter(
    (person) =>
      !person.leftAt ||
      expense?.payerId === person.id ||
      expense?.splits.some((split) => split.participantId === person.id),
  );
  const total = Number(amount);
  const ordered = [...selected].sort();
  const baseShare = selected.length ? Math.floor(total / selected.length) : 0;
  const remainder = selected.length ? total % selected.length : 0;
  const splitTotal = selected.reduce(
    (sum, id) => sum + Number(shares[id] ?? 0),
    0,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (
      !saved &&
      (!selected.length ||
        !Number.isInteger(total) ||
        total < 1 ||
        (splitMode === "CUSTOM" && splitTotal !== total))
    ) {
      setError(
        "Chọn người tham gia; tổng tiền chia phải bằng khoản chi, dùng số nguyên VNĐ.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      let row = saved;
      if (!row) {
        const input = {
          title: title.trim(),
          description: description.trim(),
          payerId,
          amount: total,
          splitMode,
          ...(splitMode === "EQUAL"
            ? { participantIds: selected }
            : {
                splits: selected.map((participantId) => ({
                  participantId,
                  amount: Number(shares[participantId] ?? 0),
                })),
              }),
          ...(expense
            ? { version: expense.version, reason: reason.trim() }
            : {}),
        };
        const body = JSON.stringify(input);
        if (!draft.current || draft.current.body !== body)
          draft.current = { body, clientId: crypto.randomUUID() };
        row = await apiFetch<Expense>(
          `/houses/${houseId}/expenses${expense ? `/${expense.id}` : ""}`,
          {
            method: expense ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...input,
              clientId: draft.current.clientId,
            }),
          },
        );
        setSaved(row);
      }
      if (receipt) {
        const body = new FormData();
        body.set("version", String(row.version));
        body.set("receipt", receipt);
        await apiFetch(`/houses/${houseId}/expenses/${row.id}/receipt`, {
          method: "POST",
          body,
          timeoutMs: 60000,
        });
      }
      onSaved();
    } catch (error) {
      setError(expenseError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form expense-form" onSubmit={submit}>
      <h2>
        {expense
          ? expense.status === "SETTLED"
            ? "Điều chỉnh khoản đã quyết toán"
            : "Chỉnh sửa khoản chi"
          : "Ghi khoản chi"}
      </h2>
      {saved && (
        <p role="status">
          Khoản chi đã lưu. Bạn có thể thử tải lại biên nhận hoặc đóng form.
        </p>
      )}
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending || !!saved}>
        <Input
          id="expense-title"
          label="Tên khoản chi"
          required
          maxLength={150}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="form-grid">
          <Input
            id="expense-amount"
            label="Tổng tiền (VNĐ)"
            type="number"
            min={1}
            max={2000000000}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <Select
            id="expense-payer"
            label="Người đã trả tiền"
            value={payerId}
            onChange={(event) => setPayerId(event.target.value)}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
                {person.isGuest ? " · Không dùng app" : ""}
                {person.leftAt ? " · Đã rời" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          id="expense-description"
          label="Ghi chú (tùy chọn)"
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Select
          id="expense-mode"
          label="Cách chia"
          value={splitMode}
          onChange={(event) =>
            setSplitMode(event.target.value as "EQUAL" | "CUSTOM")
          }
        >
          <option value="EQUAL">Chia đều</option>
          <option value="CUSTOM">Số tiền cụ thể</option>
        </Select>
        <div className="expense-shares">
          <strong>Người tham gia</strong>
          {people.map((person) => (
            <div className="expense-share" key={person.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(person.id)}
                  onChange={(event) =>
                    setSelected((old) =>
                      event.target.checked
                        ? [...old, person.id]
                        : old.filter((id) => id !== person.id),
                    )
                  }
                />{" "}
                {person.displayName}
                {person.isGuest && " · Không dùng app"}
              </label>
              {selected.includes(person.id) &&
                (splitMode === "CUSTOM" ? (
                  <Input
                    id={`share-${person.id}`}
                    label={`Phần của ${person.displayName} (VNĐ)`}
                    type="number"
                    min={0}
                    max={2000000000}
                    step={1}
                    required
                    value={shares[person.id] ?? ""}
                    onChange={(event) =>
                      setShares((old) => ({
                        ...old,
                        [person.id]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <span>
                    {money(
                      baseShare +
                        (ordered.indexOf(person.id) < remainder ? 1 : 0),
                    )}
                  </span>
                ))}
            </div>
          ))}
        </div>
        <p className="text-muted">
          {splitMode === "EQUAL"
            ? "Chia theo VNĐ nguyên; phần dư 1đ được phân bổ cố định theo người tham gia."
            : `Đã chia ${money(splitTotal)} / ${money(total || 0)}.`}
        </p>
        {expense && (
          <Textarea
            id="expense-reason"
            label="Lý do chỉnh sửa"
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint={
              expense.status === "SETTLED"
                ? "Khoản sẽ mở lại. Các thanh toán đã xác nhận vẫn được giữ để tính công nợ sau điều chỉnh."
                : "Lưu cùng thông tin trước và sau khi sửa."
            }
          />
        )}
      </fieldset>
      <Input
        id="expense-receipt"
        label="Ảnh biên nhận (tùy chọn)"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file && file.size > 5 * 1024 * 1024) {
            setError("Biên nhận tối đa 5 MB.");
            event.target.value = "";
            return;
          }
          setReceipt(file);
        }}
        hint="Biên nhận chỉ hiển thị cho người có quyền xem khoản chi."
      />
      <div className="finance-actions">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Đang lưu…"
            : saved
              ? "Thử tải biên nhận lại"
              : "Lưu khoản chi"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
