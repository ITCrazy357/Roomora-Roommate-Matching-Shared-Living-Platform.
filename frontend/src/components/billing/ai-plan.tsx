"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  billingError,
  billingPost,
  paymentLabels,
  type ServiceCatalog,
  type ServiceOrder,
} from "@/lib/billing";
import { money } from "@/lib/listings";
import { Button, ErrorState } from "../ui";
import { AiPanel } from "../ai/ai-panel";
import { useAi } from "../ai/use-ai";
export function AiPlan({
  catalog,
  reload,
  revision,
}: {
  catalog: ServiceCatalog;
  reload: () => void;
  revision: string;
}) {
  const { usage, error: usageError, refreshUsage } = useAi<never>();
  useEffect(() => {
    void refreshUsage();
  }, [revision, refreshUsage]);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const clientId = useRef<string | null>(null);
  async function buy() {
    if (pending) return;
    setPending(true);
    setError("");
    clientId.current ??= crypto.randomUUID();
    try {
      const order = await billingPost<ServiceOrder>("/services/ai-orders", {
        clientId: clientId.current,
      });
      if (order.status !== "PENDING") {
        clientId.current = null;
        reload();
        return;
      }
      const result = await billingPost<{ payUrl: string }>(
        `/services/orders/${order.id}/checkout`,
      );
      window.location.assign(result.payUrl);
    } catch (error) {
      if (
        error instanceof ApiError &&
        ["ORDER_CANCELLED", "ORDER_NOT_PENDING", "ORDER_ALREADY_PAID"].includes(
          error.code ?? "",
        )
      )
        clientId.current = null;
      setError(billingError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  return (
    <div id="goi-ai" className="ai-plan-anchor">
      <AiPanel
        title="Gói AI 50 lượt"
        detail="Viết mô tả, đọc biên nhận, đề xuất bộ lọc, giải thích độ phù hợp và tóm tắt chi tiêu."
        usage={usage}
        error={usageError}
        pending={pending}
        purchaseLink={false}
        sendDataNotice={false}
      >
        <div className="ai-plan-price">
          <strong>{money(catalog.aiPlan.amount)}</strong>
          <span> / {catalog.aiPlan.credits} lượt</span>
        </div>
        <ul>
          <li>5 lượt đầu miễn phí, cấp một lần cho mỗi tài khoản.</li>
          <li>
            Lượt mua cộng vào tài khoản, không hết hạn và không tự gia hạn.
          </li>
          <li>Chỉ trừ lượt khi có kết quả hợp lệ; lỗi AI được trả lại lượt.</li>
          <li>
            Gói chưa dùng có thể yêu cầu hoàn trong 24 giờ theo quy trình kiểm
            tra.
          </li>
        </ul>
        {error && <ErrorState message={error} />}
        <Button
          disabled={
            pending ||
            !catalog.paymentAvailable ||
            usage?.available === false
          }
          onClick={() => void buy()}
        >
          {pending
            ? "Đang tạo thanh toán…"
            : `Mua 50 lượt · ${money(catalog.aiPlan.amount)}`}
        </Button>
        <p className="text-muted">
          Thanh toán qua {paymentLabels[catalog.provider]}. Chỉ cộng lượt sau
          khi máy chủ xác nhận thanh toán.
        </p>
      </AiPanel>
    </div>
  );
}
