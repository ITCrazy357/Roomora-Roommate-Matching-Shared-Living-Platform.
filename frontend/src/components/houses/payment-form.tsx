"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const [proof, setProof] = useState<{ file: File; url: string } | null>(null);
  const proofUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = useRef<{
    body: string;
    file: File | null;
    clientId: string;
  } | null>(null);
  useEffect(
    () => () => {
      if (proofUrl.current) URL.revokeObjectURL(proofUrl.current);
    },
    [],
  );
  function chooseProof(file: File | null) {
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (proofUrl.current) URL.revokeObjectURL(proofUrl.current);
    proofUrl.current = file ? URL.createObjectURL(file) : null;
    setProof(file ? { file, url: proofUrl.current! } : null);
    if (!file && fileInput.current) fileInput.current.value = "";
    setError("");
  }
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
    const file = proof?.file ?? null;
    if (
      !draft.current ||
      draft.current.body !== body ||
      draft.current.file !== file
    )
      draft.current = { body, file, clientId: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const payment = { ...input, clientId: draft.current.clientId };
      let requestBody: string | FormData = JSON.stringify(payment);
      if (file) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(payment))
          formData.append(key, String(value));
        formData.append("proof", file);
        requestBody = formData;
      }
      await apiFetch(`/houses/${houseId}/expenses/payments`, {
        method: "POST",
        ...(file ? {} : { headers: { "Content-Type": "application/json" } }),
        body: requestBody,
        timeoutMs: file ? 60000 : 8000,
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
        disabled={pending}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Select
        id="payment-method"
        label="Hình thức"
        value={method}
        disabled={pending}
        onChange={(event) => {
          setMethod(event.target.value);
          if (event.target.value === "CASH") chooseProof(null);
        }}
      >
        <option value="BANK_TRANSFER">Chuyển khoản</option>
        <option value="CASH">Tiền mặt</option>
      </Select>
      {method === "BANK_TRANSFER" && (
        <div className="payment-proof">
          <div className="field">
            <label htmlFor="payment-proof">
              Ảnh minh chứng chuyển khoản (tùy chọn)
            </label>
            <input
              ref={fileInput}
              id="payment-proof"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={pending}
              aria-describedby="payment-proof-help"
              onChange={(event) => chooseProof(event.target.files?.[0] ?? null)}
            />
          </div>
          <p id="payment-proof-help" className="text-muted">
            JPG, PNG hoặc WebP, tối đa 5 MB. Người nhận có thể xem ảnh để đối
            chiếu.
          </p>
          {proof && (
            <div className="payment-proof-preview">
              <Image
                src={proof.url}
                alt="Ảnh minh chứng chuyển khoản đã chọn"
                width={800}
                height={800}
                unoptimized
              />
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => chooseProof(null)}
              >
                Bỏ ảnh
              </Button>
            </div>
          )}
        </div>
      )}
      <Textarea
        id="payment-note"
        label="Ghi chú (tùy chọn)"
        maxLength={1000}
        value={note}
        disabled={pending}
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
