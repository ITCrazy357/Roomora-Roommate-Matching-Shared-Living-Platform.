"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  billingError,
  billingPost,
  refundLabels,
  serviceDate,
  type ServiceOrder,
  type RefundDetail,
} from "@/lib/billing";
import { money } from "@/lib/listings";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
import {
  findRefundBank,
  normalizeAccountName,
  useRefundBanks,
} from "@/lib/refund-banks";
import { RefundProof } from "./refund-proof";

export function ServiceRefundPanel({
  order,
  reload,
}: {
  order: ServiceOrder;
  reload: () => void;
}) {
  const [form, setForm] = useState(false),
    [reason, setReason] = useState("");
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [now, setNow] = useState(() =>
    new Date(order.refundServerTime).getTime(),
  );
  const [recipient, setRecipient] = useState({
    bankId: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
    differentAccountReason: "",
  });
  const [proof, setProof] = useState("");
  const composingName = useRef(false);
  const {
    banks,
    error: bankError,
    reload: reloadBanks,
  } = useRefundBanks(
    order.refund?.status === "APPROVED" &&
      order.refund.method === "MANUAL_BANK",
  );
  const bank = findRefundBank(banks, recipient.bankId);
  const refundId = order.refund?.id,
    version = order.refund?.version;
  useEffect(() => {
    if (!refundId) return;
    const controller = new AbortController();
    apiFetch<RefundDetail>(`/services/orders/${order.id}/refund`, {
      signal: controller.signal,
    })
      .then((data) => {
        setDetail(data);
        setRecipient({
          bankId: data.bankId ?? "",
          bankName: data.bankName ?? "",
          accountNumber: data.accountNumber ?? "",
          accountName: normalizeAccountName(data.accountName ?? ""),
          differentAccountReason: data.differentAccountReason ?? "",
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(billingError(error));
      });
    return () => controller.abort();
  }, [order.id, refundId, version]);
  useEffect(() => {
    if (refundId || !order.refundDeadline) return;
    const startedAt = performance.now(),
      serverTime = new Date(order.refundServerTime).getTime();
    const timer = setInterval(
      () => setNow(serverTime + performance.now() - startedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [refundId, order.refundDeadline, order.refundServerTime]);
  const eligible =
    order.refundEligible &&
    order.refundDeadline !== null &&
    now <= new Date(order.refundDeadline).getTime();
  const refund = detail ?? order.refund;
  async function submit(kind: "request" | "recipient") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (kind === "request") {
        await billingPost(`/services/orders/${order.id}/refund-request`, {
          reason,
        });
        setForm(false);
      } else if (detail && bank) {
        const saved = await billingPost<RefundDetail>(
          `/services/orders/${order.id}/refund/recipient`,
          {
            ...recipient,
            bankId: bank.bin,
            bankName: bank.name,
            accountName: normalizeAccountName(recipient.accountName),
            version: detail.version,
          },
        );
        setDetail(saved);
      }
      reload();
    } catch (error) {
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  if (order.status !== "PAID") return null;
  return (
    <div className="service-refund-panel">
      {!refund && (
        <>
          <p className="text-muted">
            {eligible
              ? `Có thể gửi yêu cầu hoàn tiền đến ${serviceDate(order.refundDeadline!)} (UTC+7).`
              : order.aiPack && order.aiPack.used > 0
                ? "Gói AI đã sử dụng, không thể yêu cầu hoàn toàn bộ gói."
                : "Đã hết hạn gửi yêu cầu hoàn tiền (24 giờ từ thanh toán thành công)."}
          </p>
          <Button
            variant="secondary"
            disabled={pending || !eligible}
            onClick={() => setForm(!form)}
          >
            {form ? "Đóng biểu mẫu" : "Yêu cầu hoàn tiền"}
          </Button>
          {form && (
            <form
              className="service-refund-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit("request");
              }}
            >
              <Textarea
                id={`refund-${order.id}`}
                label="Lý do yêu cầu hoàn tiền"
                required
                minLength={10}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-muted">
                Gửi đúng hạn để được xem xét; gửi hoặc được duyệt chưa có nghĩa
                tiền đã hoàn. ADMIN có thể xử lý sau hạn này.
              </p>
              <Button
                type="submit"
                disabled={pending || !eligible || reason.trim().length < 10}
              >
                Gửi yêu cầu
              </Button>
            </form>
          )}
        </>
      )}
      {refund && (
        <div className="service-notice">
          <strong>Yêu cầu hoàn tiền · {refundLabels[refund.status]}</strong>
          <p>{refund.reason}</p>
          <p>
            {money(refund.amount)} · Gửi {serviceDate(refund.createdAt)}
          </p>
          {refund.source === "SYSTEM" && (
            <p>
              Yêu cầu đối soát tự động cho giao dịch chưa được cấp quyền lợi.
            </p>
          )}
          {refund.decisionNote && <p>Lý do xử lý: {refund.decisionNote}</p>}
          {refund.status === "APPROVED" && refund.method === "MOMO" && (
            <p>
              Hoàn về phương thức MoMo gốc; không cần nhập lại tài khoản ngân
              hàng. Chờ ADMIN thực hiện và đối soát.
            </p>
          )}
          {refund.status === "APPROVED" &&
            refund.method === "MANUAL_BANK" &&
            detail && (
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit("recipient");
                }}
              >
                <p>
                  Nhập tài khoản nhận tiền để ADMIN đối chiếu. Tên/số tài khoản
                  không tự chứng minh quyền sở hữu; chỉ dùng thông tin ngân
                  hàng, không gửi mật khẩu hoặc OTP.
                </p>
                <div className="form-grid">
                  <Select
                    id={`refund-${order.id}-bankId`}
                    label="Ngân hàng nhận tiền"
                    required
                    value={bank?.bin ?? ""}
                    disabled={pending || banks.length === 0}
                    onChange={(event) => {
                      const selected = findRefundBank(
                        banks,
                        event.target.value,
                      );
                      setRecipient({
                        ...recipient,
                        bankId: selected?.bin ?? "",
                        bankName: selected?.name ?? "",
                      });
                    }}
                  >
                    <option value="">
                      {banks.length ? "Chọn ngân hàng" : "Đang tải ngân hàng…"}
                    </option>
                    {banks.map((item) => (
                      <option key={item.bin} value={item.bin}>
                        {item.name} · {item.fullName}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id={`refund-${order.id}-accountNumber`}
                    label="Số tài khoản"
                    required
                    minLength={4}
                    maxLength={50}
                    inputMode="numeric"
                    pattern="[0-9]{4,50}"
                    value={recipient.accountNumber}
                    disabled={pending}
                    onChange={(event) =>
                      setRecipient({
                        ...recipient,
                        accountNumber: event.target.value,
                      })
                    }
                  />
                  <Input
                    id={`refund-${order.id}-accountName`}
                    label="Tên chủ tài khoản"
                    hint="Tên được tự động chuyển thành chữ in hoa không dấu. Nhập đúng tên chủ tài khoản ngân hàng."
                    required
                    minLength={2}
                    maxLength={100}
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={recipient.accountName}
                    disabled={pending}
                    onCompositionStart={() => {
                      composingName.current = true;
                    }}
                    onCompositionEnd={(event) => {
                      composingName.current = false;
                      setRecipient({
                        ...recipient,
                        accountName: normalizeAccountName(
                          event.currentTarget.value,
                        ),
                      });
                    }}
                    onChange={(event) =>
                      setRecipient({
                        ...recipient,
                        accountName: composingName.current
                          ? event.target.value
                          : normalizeAccountName(event.target.value),
                      })
                    }
                  />
                </div>
                {recipient.bankId && !bank && banks.length > 0 && (
                  <p className="text-muted">
                    Ngân hàng đã lưu chưa hợp lệ. Vui lòng chọn lại từ danh
                    sách.
                  </p>
                )}
                {bankError && (
                  <ErrorState
                    message={bankError}
                    action={
                      <Button variant="secondary" onClick={reloadBanks}>
                        Tải lại ngân hàng
                      </Button>
                    }
                  />
                )}
                <Textarea
                  id={`refund-${order.id}-different`}
                  label="Lý do nhận vào tài khoản khác (nếu có)"
                  maxLength={1000}
                  value={recipient.differentAccountReason}
                  onChange={(event) =>
                    setRecipient({
                      ...recipient,
                      differentAccountReason: event.target.value,
                    })
                  }
                />
                <p>
                  {refund.verifiedAt
                    ? "ADMIN đã xác minh tài khoản. Sửa thông tin sẽ cần xác minh lại."
                    : "Tài khoản cần ADMIN xác minh trước khi chuyển khoản."}
                </p>
                <Button
                  type="submit"
                  disabled={pending || !bank || !!bankError}
                >
                  Lưu tài khoản nhận tiền
                </Button>
              </form>
            )}
          {refund.status === "PROCESSING" && (
            <p>
              Đang xử lý; chưa xác nhận tiền đã về. Thông tin nhận tiền đã khóa
              trong lần xử lý này.
            </p>
          )}
          {refund.lastError && (
            <p className="text-danger">{refund.lastError}</p>
          )}
          {refund.status === "COMPLETED" && (
            <p>
              Đã xác nhận hoàn {money(refund.amount)} lúc{" "}
              {serviceDate(refund.completedAt!)}. Mã hoàn:{" "}
              {refund.refundReference}. Quyền lợi đẩy tin đã dừng.
            </p>
          )}
          {detail &&
            detail.proofs.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                onClick={() => setProof(item.id)}
              >
                Xem chứng từ {serviceDate(item.createdAt)}
              </Button>
            ))}
          {proof && (
            <RefundProof
              key={proof}
              path={`/services/orders/${order.id}/refund/proofs/${proof}`}
            />
          )}
          {detail && (
            <details>
              <summary>Lịch sử xử lý</summary>
              <ol className="refund-history">
                {detail.actions.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.actor?.profile?.displayName ?? "Hệ thống"}
                    </strong>{" "}
                    · {serviceDate(item.createdAt)}
                    <p>
                      {item.fromStatus
                        ? refundLabels[item.fromStatus] + " → "
                        : ""}
                      {refundLabels[item.toStatus]} · {item.note}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
