"use client";
import { useRef, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { expenseError, money, type Expense } from "@/lib/expenses";
import { Button, ErrorState, Input, Select } from "../ui";
import { vietnamDate } from "./repayment-promise-form";

export function SupplierPaymentForm({
  houseId,
  expense,
  onSaved,
  onCancel,
}: {
  houseId: string;
  expense: Expense;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(expense.remainingAmount));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [paidOn, setPaidOn] = useState(vietnamDate());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const draft = useRef<{ body: string; clientId: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = Number(amount);
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > expense.remainingAmount
    ) {
      setError("Nhập số nguyên VNĐ từ 1 đến số tiền còn phải thanh toán.");
      return;
    }
    setPending(true);
    setError("");
    const input = { version: expense.version, amount: value, method, paidOn };
    const body = JSON.stringify(input);
    if (!draft.current || draft.current.body !== body)
      draft.current = { body, clientId: crypto.randomUUID() };
    try {
      await apiFetch(
        `/houses/${houseId}/expenses/${expense.id}/supplier-payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, clientId: draft.current.clientId }),
        },
      );
      onSaved();
    } catch (error) {
      setError(expenseError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="house-form" onSubmit={submit}>
      <h2>Ghi trả thêm · {expense.title}</h2>
      <p className="text-muted">
        {expense.payer.displayName} thanh toán cho chủ phòng/người bán. Còn phải
        trả: {money(expense.remainingAmount)}.
      </p>
      {error && <ErrorState message={error} />}
      <fieldset disabled={pending}>
        <Input
          id="supplier-payment-amount"
          label="Số tiền trả thêm (VNĐ)"
          type="number"
          min={1}
          max={expense.remainingAmount}
          step={1}
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <div className="form-grid">
          <Select
            id="supplier-payment-method"
            label="Phương thức"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="BANK_TRANSFER">Chuyển khoản</option>
            <option value="CASH">Tiền mặt</option>
          </Select>
          <Input
            id="supplier-payment-date"
            label="Ngày thanh toán"
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </div>
        <p className="text-muted">
          Còn lại sau lần này:{" "}
          {money(Math.max(0, expense.remainingAmount - (Number(amount) || 0)))}.
        </p>
        <div className="finance-actions">
          <Button type="submit">
            {pending ? "Đang lưu…" : "Lưu thanh toán"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Đóng
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
