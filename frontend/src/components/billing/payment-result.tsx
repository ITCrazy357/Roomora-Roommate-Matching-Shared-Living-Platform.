"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  billingError,
  orderLabels,
  paymentLabels,
  type ServiceOrder,
} from "@/lib/billing";
import { Button, ButtonLink, Card, ErrorState, LoadingState } from "../ui";
import { ServiceAccess } from "./service-access";

export function PaymentResult({ orderId }: { orderId: string }) {
  return (
    <ServiceAccess>
      <ResultContent orderId={orderId} />
    </ServiceAccess>
  );
}
function ResultContent({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ServiceOrder | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return;
    const controller = new AbortController();
    let attempts = 0,
      timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await apiFetch<ServiceOrder>(
          `/services/orders/${orderId}/sync`,
          { method: "POST", signal: controller.signal, timeoutMs: 20000 },
        );
        setOrder(result);
        setError("");
        if (result.status === "PENDING" && ++attempts < 20)
          timer = setTimeout(() => void load(), 3000);
      } catch (error) {
        if (!controller.signal.aborted) setError(billingError(error));
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [orderId, retry]);
  const valid = /^[0-9a-f-]{36}$/i.test(orderId);
  return (
    <section className="container page-section narrow services-page">
      <Card className="service-result">
        <span className="content-label">
          {order ? `${paymentLabels[order.provider]} · ` : ""}Kết quả thanh toán
        </span>
        <h1>{order ? orderLabels[order.status] : "Kiểm tra thanh toán"}</h1>
        {!valid ? (
          <ErrorState message="Không tìm thấy mã đơn hợp lệ. Mở lịch sử thanh toán để kiểm tra." />
        ) : error ? (
          <ErrorState
            message={error}
            action={
              <Button onClick={() => setRetry((value) => value + 1)}>
                Thử lại
              </Button>
            }
          />
        ) : !order ? (
          <LoadingState />
        ) : (
          <>
            <p>
              {order.listingTitle} · {order.planName}
            </p>
            <p>
              {order.status === "PAID"
                ? order.boost
                  ? "Quyền lợi đã được cấp. Xem thời hạn và tải biên nhận trong lịch sử."
                  : "Đã nhận thanh toán nhưng tin không còn đủ điều kiện. Yêu cầu hoàn tiền đã được tạo để kiểm tra."
                : order.status === "PENDING"
                  ? "Đang chờ xác nhận từ cổng thanh toán. Bạn có thể quay về lịch sử; hệ thống tiếp tục tiếp nhận kết quả khi bạn đóng trang."
                  : "Chưa ghi nhận thanh toán thành công. Kiểm tra lịch sử trước khi tạo đơn mới."}
            </p>
            <Button
              variant="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Kiểm tra lại
            </Button>
            {order.status === "CANCELLED" && (
              <ButtonLink href={`/dich-vu?listing=${order.listingId}`}>
                Chọn tin & tạo thanh toán mới
              </ButtonLink>
            )}
          </>
        )}
        <p className="text-muted">
          Kết quả lấy từ máy chủ Roomora. Tham số trên đường dẫn quay về không
          kích hoạt gói.
        </p>
        <ButtonLink href="/dich-vu?tab=history">
          Về lịch sử thanh toán
        </ButtonLink>
      </Card>
    </section>
  );
}
