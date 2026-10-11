"use client";
import Link from "next/link";
import { useState } from "react";
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
import { Button, Card, ErrorState, Textarea } from "../ui";

export function ServiceOrderCard({
  order,
  reload,
  paymentAvailable,
}: {
  order: ServiceOrder;
  reload: () => void;
  paymentAvailable: boolean;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [form, setForm] = useState(false),
    [reason, setReason] = useState("");
  async function act(kind: "checkout" | "receipt" | "refund") {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (kind === "receipt") await downloadReceipt(order.id);
      else if (kind === "refund") {
        await billingPost(`/services/orders/${order.id}/refund-request`, {
          reason,
        });
        setForm(false);
        reload();
      } else {
        const result = await billingPost<{ payUrl: string }>(
          `/services/orders/${order.id}/checkout`,
        );
        window.location.assign(result.payUrl);
      }
    } catch (error) {
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="service-order-card">
      <div className="service-order-heading">
        <div>
          <span className="eyebrow">{order.planName}</span>
          <h2>
            <Link href={`/phong/${order.listingId}`}>{order.listingTitle}</Link>
          </h2>
        </div>
        <span
          className={`service-status service-status-${order.status.toLowerCase()}`}
        >
          {orderLabels[order.status]}
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
      {order.refund && (
        <div className="service-notice">
          <strong>Yêu cầu hoàn tiền · Chờ kiểm tra</strong>
          <p>{order.refund.reason}</p>
          <p>
            Đã tiếp nhận {serviceDate(order.refund.createdAt)}. Chưa xác nhận
            hoàn tiền; quyền lợi đã cấp vẫn theo thời hạn.
          </p>
        </div>
      )}
      {error && <ErrorState message={error} />}
      <div className="service-actions">
        {order.status === "PENDING" && (
          <Button
            disabled={pending || !paymentAvailable}
            onClick={() => void act("checkout")}
          >
            Tiếp tục thanh toán {paymentLabels[order.provider]}
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
        {order.status === "PAID" && !order.refund && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setForm(!form)}
          >
            {form ? "Đóng biểu mẫu" : "Yêu cầu hoàn tiền"}
          </Button>
        )}
      </div>
      {form && (
        <form
          className="service-refund-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act("refund");
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
            Yêu cầu sẽ được kiểm tra trước khi xử lý. Gửi yêu cầu không tự hoàn
            tiền hoặc hủy quyền lợi.
          </p>
          <Button type="submit" disabled={pending || reason.trim().length < 10}>
            Gửi yêu cầu
          </Button>
        </form>
      )}
    </Card>
  );
}
