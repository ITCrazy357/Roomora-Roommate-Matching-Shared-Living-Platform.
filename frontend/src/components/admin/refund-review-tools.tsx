"use client";
import { useState } from "react";
import type { RefundDetail } from "@/lib/billing";
import { money } from "@/lib/listings";
import { Button, Select } from "../ui";
import {
  findRefundBank,
  normalizeAccountName,
  useRefundBanks,
} from "@/lib/refund-banks";

export function RefundNoteOptions({
  refund,
  note,
  disabled,
  onChange,
}: {
  refund: RefundDetail;
  note: string;
  disabled: boolean;
  onChange: (note: string) => void;
}) {
  const options = {
    PENDING: [
      [
        "Duyệt — Yêu cầu hợp lệ",
        "Đã kiểm tra giao dịch thanh toán và yêu cầu hoàn tiền; chấp thuận xử lý theo quy trình.",
      ],
      [
        "Từ chối — Chưa đủ căn cứ",
        "Chưa đủ căn cứ đối chiếu yêu cầu hoàn tiền với giao dịch thanh toán gốc.",
      ],
      [
        "Từ chối — Không xác minh được khoản thu",
        "Không xác minh được giao dịch thanh toán gốc phù hợp với yêu cầu hoàn tiền.",
      ],
    ],
    APPROVED: [
      [
        "Xác minh — Đã đối chiếu tài khoản",
        "Đã đối chiếu giao dịch gốc và căn cứ xác minh chủ tài khoản nhận hoàn tiền.",
        "MANUAL_BANK",
      ],
      [
        "Xử lý — Đã kiểm tra khoản thu",
        "Đã đối soát giao dịch gốc chưa hoàn hoặc đảo tiền; bắt đầu xử lý khoản hoàn.",
      ],
      [
        "Từ chối — Không xác minh được tài khoản",
        "Không đủ căn cứ xác minh tài khoản nhận tiền sau khi đối chiếu.",
        "MANUAL_BANK",
      ],
    ],
    PROCESSING: [
      [
        "Hoàn tất — Đã đối chiếu chuyển khoản",
        `Đã đối chiếu giao dịch hoàn tiền thực tế với chứng từ: đúng người nhận, đúng ${money(refund.amount)} và chưa hoàn trước đó.`,
      ],
      [
        "Thất bại — Ngân hàng xác nhận chưa chuyển",
        "Ngân hàng xác nhận giao dịch chuyển khoản thất bại và chưa chuyển tiền đến người nhận.",
      ],
    ],
    FAILED: [
      [
        "Thử lại — Đã xác nhận lần trước thất bại",
        "Đã kiểm tra lần xử lý trước thất bại, chưa chuyển tiền; chấp thuận xử lý lại yêu cầu hiện tại.",
      ],
    ],
    COMPLETED: [],
    REJECTED: [],
  }[refund.status].filter(
    ([, , method]) => !method || method === refund.method,
  );
  return (
    <Select
      id="refund-note-option"
      label="Chọn mẫu ghi chú"
      value={options.some(([, value]) => value === note) ? note : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Tự nhập / chỉnh sửa ghi chú</option>
      {options.map(([label, value]) => (
        <option key={label} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export function RefundCopyValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const [message, setMessage] = useState("");
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`Đã sao chép ${label.toLowerCase()}.`);
    } catch {
      setMessage(
        "Chưa sao chép được. Bạn có thể chọn và sao chép nội dung bên cạnh.",
      );
    }
  }
  return (
    <div className="refund-copy-value">
      <div>
        <span className="text-muted text-sm">{label}</span>
        <p>{value || "Chưa cung cấp"}</p>
      </div>
      {value && (
        <Button
          variant="secondary"
          onClick={() => void copy()}
          aria-label={`Sao chép ${label.toLowerCase()}`}
        >
          Sao chép
        </Button>
      )}
      {message && (
        <p role="status" className="text-muted text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

export function RefundAccountComparison({ refund }: { refund: RefundDetail }) {
  const { banks } = useRefundBanks();
  const normalize = (value: string) =>
    normalizeAccountName(value).replace(/\s+/g, "");
  const bankId = (value: string | null) =>
    findRefundBank(banks, value)?.bin ?? value;
  const rows = [
    ["Mã ngân hàng", bankId(refund.order.payerBankId), bankId(refund.bankId)],
    ["Số tài khoản", refund.order.payerAccount, refund.accountNumber],
    ["Chủ tài khoản", refund.order.payerName, refund.accountName],
  ];
  return (
    <div className="refund-comparison">
      <div className="refund-comparison-head">
        <span>Thông tin</span>
        <span>Thanh toán gốc</span>
        <span>Khách đề nghị nhận hoàn</span>
        <span>So sánh</span>
      </div>
      {rows.map(([label, original, recipient]) => (
        <div className="refund-comparison-row" key={label}>
          <strong>{label}</strong>
          <span>
            <span className="refund-mobile-label">Thanh toán gốc: </span>
            {original || "Cổng chưa cung cấp"}
          </span>
          <span>
            <span className="refund-mobile-label">Nhận hoàn: </span>
            {recipient || "Chưa cung cấp"}
          </span>
          <span>
            {!original || !recipient
              ? "Chưa đủ dữ liệu"
              : (
                    label === "Chủ tài khoản"
                      ? normalize(original) === normalize(recipient)
                      : original === recipient
                  )
                ? "Trùng thông tin"
                : "Khác thông tin"}
          </span>
        </div>
      ))}
      <p className="text-muted text-sm">
        So sánh giúp phát hiện khác biệt; ADMIN vẫn cần đối chiếu giao dịch và
        xác minh chủ tài khoản.
      </p>
    </div>
  );
}

export function RefundTransferSummary({ refund }: { refund: RefundDetail }) {
  return (
    <div className="service-notice refund-transfer-summary">
      <h3>Thông tin chuyển khoản đã xác minh</h3>
      <RefundCopyValue label="Ngân hàng nhận" value={refund.bankName} />
      <RefundCopyValue label="Số tài khoản nhận" value={refund.accountNumber} />
      <RefundCopyValue label="Chủ tài khoản nhận" value={refund.accountName} />
      <RefundCopyValue label="Số tiền (VND)" value={String(refund.amount)} />
      <RefundCopyValue
        label="Nội dung chuyển khoản gợi ý"
        value={`HOAN ${refund.id}`}
      />
      <p className="text-muted text-sm">
        Nội dung gợi ý giúp tra cứu yêu cầu. Mã giao dịch hoàn tiền phải lấy từ
        ngân hàng sau khi chuyển khoản.
      </p>
    </div>
  );
}
