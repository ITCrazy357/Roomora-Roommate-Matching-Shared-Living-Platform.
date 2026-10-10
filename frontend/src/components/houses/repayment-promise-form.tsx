"use client";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import {
  expenseError,
  money,
  type Transfer,
  type RepaymentPromise,
} from "@/lib/expenses";
import { Button, ErrorState, Input } from "../ui";

export const vietnamDate = (date = new Date()) =>
  new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);

export function RepaymentPromiseForm({
  houseId,
  transfer,
  promise,
  onSaved,
  onCancel,
}: {
  houseId: string;
  transfer: Transfer;
  promise?: RepaymentPromise;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [dates] = useState(() => {
    const now = new Date();
    return {
      today: vietnamDate(now),
      maximum: vietnamDate(new Date(now.getTime() + 30 * 86400000)),
      suggested: vietnamDate(new Date(now.getTime() + 7 * 86400000)),
    };
  });
  const [payOn, setPayOn] = useState(promise?.payOn ?? dates.suggested);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await apiFetch(`/houses/${houseId}/expenses/repayment-promises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: transfer.recipientId,
          payOn,
          ...(promise ? { version: promise.version } : {}),
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
      <h2>Hẹn ngày trả tiền</h2>
      <p>
        {transfer.payerName} → {transfer.recipientName} ·{" "}
        {money(transfer.amount)}
      </p>
      <p className="text-muted">
        Người nhận được thông báo ngày hẹn. Email nhắc khoản này tạm dừng đến
        hết ngày hẹn; nếu còn khoản khác chưa hẹn, bạn vẫn có thể nhận nhắc nợ.
        Sau ngày hẹn, hệ thống nhắc tối đa mỗi 7 ngày.
      </p>
      {!transfer.recipientUserId && (
        <p className="text-muted">
          Người nhận ngoài ứng dụng: trưởng nhà nhận thông báo để trao đổi với
          họ.
        </p>
      )}
      {error && <ErrorState message={error} />}
      <Input
        id="repayment-date"
        label="Ngày trả dự kiến"
        type="date"
        value={payOn}
        min={dates.today}
        max={dates.maximum}
        required
        disabled={pending}
        onChange={(event) => setPayOn(event.target.value)}
      />
      <div className="finance-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu ngày hẹn"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
