"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { expenseError, money, type Transfer } from "@/lib/expenses";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
export function PaymentForm({
  houseId,
  transfer,
  onSaved,
  onCancel,
}: {
  houseId: string;
  transfer: Transfer;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(transfer.amount));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const draft = useRef<{ body: string; clientId: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const input = {
      payerId: transfer.payerId,
      recipientId: transfer.recipientId,
      amount: Number(amount),
      method,
      note: note.trim(),
    };
    const body = JSON.stringify(input);
    if (!draft.current || draft.current.body !== body)
      draft.current = { body, clientId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      await apiFetch(`/houses/${houseId}/expenses/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          clientId: draft.current.clientId,
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
    <form className="house-form" onSubmit={submit}>
      <h2>Ghi nhận đã trả tiền</h2>
      <p>
        {transfer.payerName} → {transfer.recipientName} · Còn{" "}
        {money(transfer.amount)}
      </p>
      <p className="text-muted">
        Chỉ ghi nhận sau khi đã giao tiền hoặc chuyển khoản. Số dư thay đổi khi
        người nhận xác nhận.
      </p>
      {!transfer.recipientUserId && (
        <p className="text-muted">
          Người nhận không dùng app. Trưởng nhà ghi nhận xác nhận thủ công sau
          khi kiểm tra với người nhận.
        </p>
      )}
      {error && <ErrorState message={error} />}
      <Input
        id="payment-amount"
        label="Số tiền đã trả (VNĐ)"
        type="number"
        min={1}
        max={transfer.amount}
        step={1}
        required
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Select
        id="payment-method"
        label="Hình thức"
        value={method}
        onChange={(event) => setMethod(event.target.value)}
      >
        <option value="BANK_TRANSFER">Chuyển khoản</option>
        <option value="CASH">Tiền mặt</option>
      </Select>
      <Textarea
        id="payment-note"
        label="Ghi chú (tùy chọn)"
        maxLength={1000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="finance-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang ghi nhận…" : "Ghi nhận đã trả"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
