"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { money } from "@/lib/listings";
import {
  billingError,
  billingPost,
  boostLabel,
  downloadReceipt,
  orderLabels,
  paymentLabels,
  serviceDate,
  type ServiceOrder,
} from "@/lib/billing";
import { Button, Card, ErrorState } from "../ui";
import { ServiceRefundPanel } from "./service-refund-panel";

export function ServiceOrderCard({
  order,
  reload,
  paymentAvailable,
  retryAvailable,
}: {
  order: ServiceOrder;
  reload: () => void;
  paymentAvailable: boolean;
  retryAvailable: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const retryClientId = useRef<string | null>(null);
  async function act(kind: "checkout" | "receipt" | "retry" | "sync") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (kind === "sync") {
        await billingPost(`/services/orders/${order.id}/sync`, {}, 20000);
        reload();
      } else if (kind === "receipt") await downloadReceipt(order.id);
      else {
        let checkoutId = order.id;
        if (kind === "retry") {
          retryClientId.current ??= crypto.randomUUID();
          const next = await billingPost<ServiceOrder>(
            order.planCode === "AI_50_CREDITS"
              ? "/services/ai-orders"
              : "/services/orders",
            {
              ...(order.listingId ? { listingId: order.listingId } : {}),
              clientId: retryClientId.current,
            },
          );
          if (next.status !== "PENDING") {
            retryClientId.current = null;
            throw new ApiError(
              "Order is not pending",
              "http",
              409,
              "ORDER_NOT_PENDING",
            );
          }
          checkoutId = next.id;
        }
        const result = await billingPost<{ payUrl: string }>(
          `/services/orders/${checkoutId}/checkout`,
        );
        window.location.assign(result.payUrl);
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        ["ORDER_CANCELLED", "ORDER_NOT_PENDING"].includes(error.code ?? "")
      )
        retryClientId.current = null;
      setError(
        error instanceof ApiError && error.code === "ORDER_ALREADY_PAID"
          ? ""
          : billingError(error),
      );
      reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="service-order-card">
      <div className="service-order-heading">
        <div>
          <span className="content-label">{order.planName}</span>
          <h2>
            <Link
              href={
                order.listingId
                  ? `/phong/${order.listingId}`
                  : "/dich-vu#goi-ai"
              }
            >
              {order.listingTitle}
            </Link>
          </h2>
        </div>
        <span
          className={`service-status service-status-${order.status.toLowerCase()}`}
        >
          {order.paymentConfirmationPending
            ? "Đang xác nhận thanh toán"
            : orderLabels[order.status]}
        </span>
      </div>
      <div className="service-order-details">
        <strong>{money(order.amount)}</strong>
        <span>{serviceDate(order.createdAt)}</span>
        <span>
          {paymentLabels[order.provider]}
          {order.provider === "PAYOS" ? " · Tiền thật" : ""}
        </span>
        <span className="service-order-id">Mã đơn: {order.id}</span>
      </div>
      {order.boost && (
        <p>
          <strong>{boostLabel(order)}</strong> ·{" "}
          {serviceDate(order.boost.startsAt)} →{" "}
          {serviceDate(order.boost.endsAt)} (UTC+7)
        </p>
      )}
      {order.aiPack && (
        <p>
          <strong>
            {order.aiPack.revokedAt
              ? "Đã thu hồi sau hoàn tiền"
              : order.aiPack.held
                ? "Tạm giữ trong khi kiểm tra hoàn tiền"
                : `Còn ${order.aiPack.credits - order.aiPack.used}/${order.aiPack.credits} lượt AI`}
          </strong>{" "}
          · Không hết hạn
        </p>
      )}
      {order.boost && (
        <p className="text-muted">
          Ưu tiên hiển thị khi tin đang công khai và còn nhận người. Đóng hoặc
          sửa tin không tạm dừng thời hạn. Đóng tin kết thúc đợt đăng này.
        </p>
      )}
      {order.status === "PENDING" && (
        <p className="text-muted">
          Đơn chờ đến {serviceDate(order.expiresAt)}. Chỉ cấp quyền lợi sau khi
          cổng thanh toán xác nhận.
        </p>
      )}
      {error && <ErrorState message={error} />}
      {(order.paymentConfirmationPending || order.paymentStatusUnavailable) &&
        order.status !== "PAID" && (
          <p className="service-notice">
            {order.paymentConfirmationPending
              ? "PayOS đã nhận tiền hoặc đang xử lý. Hệ thống đang đối soát; bạn chưa cần thanh toán lại."
              : "Chưa kiểm tra được trạng thái PayOS. Kiểm tra lại giao dịch trước khi tiếp tục thanh toán."}
          </p>
        )}
      {order.status === "CANCELLED" && (
        <p className="text-muted">
          Link cũ đã hủy. Bạn có thể tạo đơn mới nếu dịch vụ còn đủ điều kiện.
        </p>
      )}
      <div className="service-actions">
        {order.status === "PENDING" &&
          !order.paymentConfirmationPending &&
          !order.paymentStatusUnavailable && (
            <Button
              disabled={pending || !paymentAvailable}
              onClick={() => void act("checkout")}
            >
              Tiếp tục thanh toán {paymentLabels[order.provider]}
            </Button>
          )}
        {["CANCELLED", "EXPIRED", "FAILED"].includes(order.status) &&
          retryAvailable &&
          !order.paymentConfirmationPending &&
          !order.paymentStatusUnavailable && (
            <Button disabled={pending} onClick={() => void act("retry")}>
              {pending ? "Đang tạo thanh toán…" : "Tạo thanh toán mới"}
            </Button>
          )}
        {(order.paymentConfirmationPending || order.paymentStatusUnavailable) &&
          order.status !== "PAID" && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void act("sync")}
            >
              Kiểm tra trạng thái thanh toán
            </Button>
          )}
        {order.status === "PAID" && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => void act("receipt")}
          >
            Tải biên nhận PDF
          </Button>
        )}
      </div>
      <ServiceRefundPanel order={order} reload={reload} />
    </Card>
  );
}
