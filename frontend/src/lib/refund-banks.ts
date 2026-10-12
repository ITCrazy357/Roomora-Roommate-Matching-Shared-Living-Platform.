"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface RefundBank {
  bin: string;
  code: string;
  name: string;
  fullName: string;
}

export function normalizeAccountName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase();
}

export function findRefundBank(banks: RefundBank[], value: string | null) {
  const key = value?.trim().toUpperCase();
  return banks.find((bank) => bank.bin === key || bank.code === key);
}

export function useRefundBanks(enabled = true) {
  const [banks, setBanks] = useState<RefundBank[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiFetch<RefundBank[]>("/services/refund-banks", {
      signal: controller.signal,
    })
      .then((data) => {
        setBanks(data);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Chưa tải được danh sách ngân hàng. Vui lòng thử lại.");
      });
    return () => controller.abort();
  }, [enabled, retry]);
  return { banks, error, reload: () => setRetry((value) => value + 1) };
}
