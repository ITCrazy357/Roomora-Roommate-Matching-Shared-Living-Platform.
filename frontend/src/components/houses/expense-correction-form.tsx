"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  expenseError,
  money,
  type Expense,
  type ExpensePage,
  type Participant,
} from "@/lib/expenses";
import { sharingAmounts } from "@/lib/cost-sharing";
import {
  Button,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Textarea,
} from "../ui";
import { Pagination } from "../communications/pagination";

export function ExpenseCorrectionForm({
  houseId,
  userId,
  ownerId,
  participants,
  onSaved,
  onCancel,
}: {
  houseId: string;
  userId: string;
  ownerId: string;
  participants: Participant[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [page, setPage] = useState(1);
  const [sources, setSources] = useState<ExpensePage | null>(null);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ExpensePage>(
      `/houses/${houseId}/expenses?status=SETTLED&page=${page}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setSources(result);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(expenseError(error));
      });
    return () => controller.abort();
  }, [houseId, page]);
  return (
    <div className="house-stack">
      <div className="house-row">
        <h2>Điều chỉnh sau chốt</h2>
        <Button variant="secondary" onClick={onCancel}>
          Đóng
        </Button>
      </div>
      <p className="finance-note">
        Khoản gốc, biên nhận và các thanh toán cũ được giữ nguyên. Chênh lệch
        được ghi vào đợt mới; giảm khoản chi có thể phát sinh tiền cần hoàn lại.
        Điều chỉnh đã ghi cũng chỉ được xem.
      </p>
      {error && <ErrorState message={error} />}
      {sources?.page === page ? (
        <>
          <Select
            id="correction-source"
            label="Khoản đã chốt cần điều chỉnh"
            value={expense?.id ?? ""}
            onChange={(event) =>
              setExpense(
                sources.items.find((row) => row.id === event.target.value) ??
                  null,
              )
            }
          >
            <option value="">Chọn khoản chi</option>
            {sources.items
              .filter((row) => ownerId === userId || row.createdById === userId)
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} · {money(row.amount)}
                </option>
              ))}
          </Select>
          {sources.total === 0 && (
            <p className="text-muted">Chưa có khoản chi đã chốt.</p>
          )}
          <Pagination
            page={page}
            pages={sources.pages}
            onChange={(next) => {
              setExpense(null);
              setPage(next);
            }}
          />
        </>
      ) : (
        !error && <LoadingState message="Đang tải khoản đã chốt…" />
      )}
      {expense && (
        <CorrectionDetails
          key={`${expense.id}:${expense.corrections[0]?.version ?? 0}`}
          houseId={houseId}
          expense={expense}
          participants={participants}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function CorrectionDetails({
  houseId,
  expense,
  participants,
  onSaved,
}: {
  houseId: string;
  expense: Expense;
  participants: Participant[];
  onSaved: () => void;
}) {
  const latest = expense.corrections[0];
  const previous = latest?.newSnapshot ?? expense;
  const [amount, setAmount] = useState(String(previous.amount));
  const [payerId, setPayerId] = useState(previous.payerId);
  const [splitMode, setSplitMode] = useState(previous.splitMode);
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(
      previous.splits.map((split) => [
        split.participantId,
        String(split.amount),
      ]),
    ),
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const retry = useRef<{ body: string; clientId: string } | null>(null);
  const historical = new Set([
    expense.payerId,
    previous.payerId,
    ...expense.splits.map((split) => split.participantId),
    ...previous.splits.map((split) => split.participantId),
  ]);
  const people = participants.filter(
    (person) => !person.leftAt || historical.has(person.id),
  );
  const total = Number(amount);
  const validAmount =
    amount.trim() !== "" &&
    Number.isSafeInteger(total) &&
    total >= 0 &&
    total <= 2_000_000_000;
  const selected = Object.keys(shares);
  const rule = expense.sharingSnapshot;
  const calculated =
    validAmount && selected.length
      ? rule
        ? sharingAmounts(total, rule.mode, rule.shares)
        : splitMode === "EQUAL"
          ? sharingAmounts(
              total,
              "EQUAL",
              selected.map((participantId) => ({
                participantId,
                basisPoints: 0,
              })),
            )
          : selected.map((participantId) => ({
              participantId,
              amount: total === 0 ? 0 : Number(shares[participantId]),
            }))
      : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (
      !validAmount ||
      !calculated.length ||
      calculated.some(
        (row) => !Number.isSafeInteger(row.amount) || row.amount < 0,
      ) ||
      calculated.reduce((sum, row) => sum + row.amount, 0) !== total
    ) {
      setError(
        "Nhập tiền VNĐ nguyên và chia đủ tổng tiền. Nhập 0 để đảo toàn bộ khoản chi.",
      );
      return;
    }
    const body = JSON.stringify({
      expenseId: expense.id,
      expenseVersion: expense.version,
      correctionVersion: latest?.version ?? 0,
      payerId,
      amount: total,
      reason: reason.trim(),
      ...(rule || splitMode === "CUSTOM"
        ? { splitMode: "CUSTOM", splits: calculated }
        : { splitMode: "EQUAL", participantIds: selected }),
    });
    if (!retry.current || retry.current.body !== body)
      retry.current = { body, clientId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      await apiFetch(`/houses/${houseId}/expenses/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(body),
          clientId: retry.current.clientId,
        }),
      });
      onSaved();
    } catch (error) {
      setError(expenseError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form expense-form" onSubmit={submit}>
      <p className="text-muted">
        {latest ? `Sau điều chỉnh #${latest.version}` : "Nội dung đã chốt"}:{" "}
        {money(previous.amount)}.
        {validAmount && (
          <>
            {" "}
            Chênh lệch lần này:{" "}
            <strong>
              {total - previous.amount > 0 ? "+" : ""}
              {money(total - previous.amount)}
            </strong>
            .
          </>
        )}
      </p>
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending}>
        <Input
          id="correction-amount"
          label="Tổng tiền đúng (VNĐ)"
          type="number"
          min={0}
          max={2_000_000_000}
          step={1}
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          hint="Nhập 0 để đảo khoản ghi sai. Chỉ phần chênh lệch được tính vào đợt mới."
        />
        <Select
          id="correction-payer"
          label="Người đã trả đúng"
          value={payerId}
          onChange={(event) => setPayerId(event.target.value)}
        >
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
              {person.leftAt ? " (đã rời nhà)" : ""}
            </option>
          ))}
        </Select>
        {rule ? (
          <p className="finance-note">
            Giữ cách chia đã thống nhất của khoản gốc.
          </p>
        ) : (
          <>
            <Select
              id="correction-split-mode"
              label="Cách chia đúng"
              value={splitMode}
              onChange={(event) =>
                setSplitMode(event.target.value as "EQUAL" | "CUSTOM")
              }
            >
              <option value="EQUAL">Chia đều</option>
              <option value="CUSTOM">Chia số tiền cụ thể</option>
            </Select>
            <div className="correction-shares">
              {people.map((person) => (
                <div className="correction-share" key={person.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={shares[person.id] !== undefined}
                      onChange={(event) =>
                        setShares((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[person.id] = "0";
                          else delete next[person.id];
                          return next;
                        })
                      }
                    />
                    {person.displayName}
                  </label>
                  {shares[person.id] !== undefined &&
                    splitMode === "CUSTOM" &&
                    total !== 0 && (
                      <Input
                        id={`correction-share-${person.id}`}
                        label={`Phần chịu của ${person.displayName} (VNĐ)`}
                        type="number"
                        min={0}
                        step={1}
                        required
                        value={shares[person.id]}
                        onChange={(event) =>
                          setShares((current) => ({
                            ...current,
                            [person.id]: event.target.value,
                          }))
                        }
                      />
                    )}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="expense-split-list">
          {calculated.map((row) => (
            <span key={row.participantId}>
              {
                participants.find((person) => person.id === row.participantId)
                  ?.displayName
              }
              : <strong>{money(row.amount || 0)}</strong>
            </span>
          ))}
        </div>
        <Textarea
          id="correction-reason"
          label="Lý do điều chỉnh"
          minLength={3}
          maxLength={1000}
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hint="Lưu cùng người ghi và nội dung trước/sau để đối chiếu."
        />
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending ? "Đang ghi…" : "Ghi điều chỉnh riêng"}
      </Button>
    </form>
  );
}
