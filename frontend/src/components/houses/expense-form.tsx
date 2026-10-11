"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { money, type Expense, type Participant } from "@/lib/expenses";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
import {
  categories,
  type ExpenseCategory,
  type RecurringDraft,
} from "@/lib/household";
import { vietnamDate } from "./repayment-promise-form";
import {
  sharingAmounts,
  sharingError,
  type SharingRule,
} from "@/lib/cost-sharing";
import { useHouseholdData } from "./use-household-data";
import { HouseholdPerson } from "./household-ui";

export function ExpenseForm({
  houseId,
  userId,
  participants,
  expense,
  recurringDraft,
  initial,
  onSaved,
  onCancel,
}: {
  houseId: string;
  userId: string;
  participants: Participant[];
  expense?: Expense;
  recurringDraft?: RecurringDraft;
  initial?: { title: string; payerId?: string; category?: ExpenseCategory };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(
    expense?.title ?? recurringDraft?.title ?? initial?.title ?? "",
  );
  const [description, setDescription] = useState(
    expense?.description ?? recurringDraft?.description ?? "",
  );
  const [amount, setAmount] = useState(
    expense
      ? String(expense.amount)
      : recurringDraft?.amount
        ? String(recurringDraft.amount)
        : "",
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ??
      recurringDraft?.category ??
      initial?.category ??
      "OTHER",
  );
  const [spentOn, setSpentOn] = useState(
    (expense?.spentOn ?? recurringDraft?.dueOn)?.slice(0, 10) ?? vietnamDate(),
  );
  const [payerId, setPayerId] = useState(
    expense?.payerId ??
      (recurringDraft &&
      participants.some((p) => p.id === recurringDraft.payerId && !p.leftAt)
        ? recurringDraft.payerId
        : (initial?.payerId ?? userId)),
  );
  const [splitMode, setSplitMode] = useState<"EQUAL" | "CUSTOM">(
    expense?.splitMode ?? "EQUAL",
  );
  const [selected, setSelected] = useState(
    expense?.splits.map((split) => split.participantId) ??
      (recurringDraft
        ? recurringDraft.participantIds.filter((id) =>
            participants.some((p) => p.id === id && !p.leftAt),
          )
        : undefined) ??
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
  const month = spentOn.slice(0, 7) || vietnamDate().slice(0, 7);
  const liveRule = useHouseholdData<SharingRule>(
    `/houses/${houseId}/cost-sharing/rule?month=${month}&category=${category}`,
  );
  const preserve =
    expense &&
    expense.category === category &&
    expense.spentOn.slice(0, 7) === month;
  const rule = preserve
    ? expense.sharingSnapshot
      ? { ...expense.sharingSnapshot, status: "READY" }
      : { status: "MANUAL" }
    : liveRule.data;
  const automatic =
    rule?.status === "READY" &&
    "mode" in rule &&
    rule.mode &&
    "shares" in rule &&
    rule.shares
      ? sharingAmounts(
          Number.isInteger(total) && total > 0 ? total : 0,
          rule.mode,
          rule.shares,
        )
      : null;
  const blocked = !rule || (rule.status !== "MANUAL" && !automatic);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!saved && blocked) {
      setError(
        !rule
          ? "Đang kiểm tra quy tắc chia. Hãy tải lại nếu chưa có kết quả."
          : "Kỳ này chưa thống nhất cách chia. Vào mục Thống nhất chia phí để hoàn tất bình chọn.",
      );
      return;
    }
    if (
      !saved &&
      (!(automatic?.length ?? selected.length) ||
        !Number.isInteger(total) ||
        total < 1 ||
        (!automatic && splitMode === "CUSTOM" && splitTotal !== total))
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
          category,
          spentOn,
          description: description.trim(),
          payerId,
          amount: total,
          splitMode: automatic ? "CUSTOM" : splitMode,
          ...(automatic
            ? { splits: automatic }
            : splitMode === "EQUAL"
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
          ...(recurringDraft ? { version: recurringDraft.version } : {}),
        };
        const body = JSON.stringify(input);
        if (!draft.current || draft.current.body !== body)
          draft.current = { body, clientId: crypto.randomUUID() };
        row = await apiFetch<Expense>(
          recurringDraft
            ? `/houses/${houseId}/household/drafts/${recurringDraft.id}/confirm`
            : `/houses/${houseId}/expenses${expense ? `/${expense.id}` : ""}`,
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
      setError(sharingError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form expense-form" onSubmit={submit}>
      <h2>
        {expense
          ? "Chỉnh sửa khoản chi"
          : recurringDraft
            ? "Xác nhận khoản định kỳ"
            : "Ghi khoản chi"}
      </h2>
      {recurringDraft && (
        <p className="finance-note">
          Kiểm tra số tiền thực tế, người đã trả và danh sách chia trước khi xác
          nhận. Người đã rời nhà được bỏ khỏi lựa chọn mặc định; khoản này chỉ
          vào sổ sau khi bạn xác nhận.
        </p>
      )}
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
          <Select
            id="expense-category"
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
          <Input
            id="expense-date"
            label="Ngày phát sinh"
            type="date"
            required
            value={spentOn}
            onChange={(event) => setSpentOn(event.target.value)}
          />
        </div>
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
        {automatic ? (
          <div className="sharing-expense-preview">
            <strong>
              {rule && "mode" in rule && rule.mode === "EQUAL"
                ? "Chia đều"
                : "Chia theo tỷ lệ"}{" "}
              · Quy tắc đã thống nhất tháng {month}
            </strong>
            <p className="text-muted">
              {preserve
                ? "Giữ quy tắc đã lưu của khoản chi này."
                : "Áp dụng phương án đã thống nhất cho đúng danh mục và tháng."}
            </p>
            {automatic.map((share) => {
              const person = people.find(
                (row) => row.id === share.participantId,
              );
              return (
                <div className="expense-share" key={share.participantId}>
                  <HouseholdPerson
                    name={person?.displayName ?? "Thành viên"}
                    avatarUrl={person?.avatarUrl}
                  />
                  <strong>{money(share.amount)}</strong>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {blocked && (
              <div className="finance-note" role="status">
                {!rule
                  ? liveRule.error || "Đang kiểm tra quy tắc chia…"
                  : "Kỳ này chưa thống nhất cách chia hoặc danh sách thành viên đã thay đổi."}{" "}
                <Button variant="secondary" onClick={liveRule.reload}>
                  Tải lại quy tắc
                </Button>
                <a
                  className="text-link"
                  href={`/nha-chung/${houseId}/chia-chi-phi`}
                >
                  Thống nhất chia phí
                </a>
              </div>
            )}
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
          </>
        )}
        {expense && (
          <Textarea
            id="expense-reason"
            label="Lý do chỉnh sửa"
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint="Lưu cùng thông tin trước và sau khi sửa."
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
        <Button type="submit" disabled={pending || (!saved && blocked)}>
          {pending
            ? "Đang lưu…"
            : saved
              ? "Thử tải biên nhận lại"
              : recurringDraft
                ? "Xác nhận vào sổ"
                : "Lưu khoản chi"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
