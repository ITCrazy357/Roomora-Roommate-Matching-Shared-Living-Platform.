"use client";
import { useEffect, useState } from "react";
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
import { Button, ErrorState, Input, Textarea } from "../ui";
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
          accountName: data.accountName ?? "",
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
      } else if (detail) {
        const saved = await billingPost<RefundDetail>(
          `/services/orders/${order.id}/refund/recipient`,
          { ...recipient, version: detail.version },
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
                  {(
                    [
                      ["bankId", "Mã ngân hàng (BIN hoặc mã ngân hàng)"],
                      ["bankName", "Tên ngân hàng"],
                      ["accountNumber", "Số tài khoản"],
                      ["accountName", "Tên chủ tài khoản"],
                    ] as const
                  ).map(([key, label]) => (
                    <Input
                      key={key}
                      id={`refund-${order.id}-${key}`}
                      label={label}
                      required
                      maxLength={
                        key === "bankId" || key === "accountNumber" ? 50 : 100
                      }
                      value={recipient[key]}
                      disabled={pending}
                      onChange={(event) =>
                        setRecipient({
                          ...recipient,
                          [key]: event.target.value,
                        })
                      }
                    />
                  ))}
                </div>
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
                <Button type="submit" disabled={pending}>
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
