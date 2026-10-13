"use client";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { adminTime, type AdminPage } from "@/lib/admin";
import { money } from "@/lib/expenses";
import { Button, Card, Input, Select } from "../ui";
import { AdminPagination, AdminResult, useAdminPage } from "./admin-shared";
interface Order {
  id: string;
  buyerName: string;
  buyerEmail: string;
  listingTitle: string;
  planName: string;
  amount: number;
  status: string;
  provider: string;
  providerOrderCode: string | null;
  providerTransId: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  refund: { id: string; status: string; amount: number } | null;
  events?: {
    id: string;
    resultCode: number;
    transId: string;
    receivedAt: string;
  }[];
  boost?: { startsAt: string; endsAt: string } | null;
}
const statuses = {
  PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FAILED: "Không thành công",
  EXPIRED: "Hết hạn",
  CANCELLED: "Đã hủy",
};
function OrderDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminPage<Order>(`/admin/orders/${id}`);
  if (!data) return <AdminResult error={error} reload={reload} />;
  return (
    <Card className="support-detail">
      <h2>Chi tiết giao dịch</h2>
      <dl className="support-order-details">
        <dt>Mã đơn</dt>
        <dd>{data.id}</dd>
        <dt>Người mua</dt>
        <dd>
          {data.buyerName} · {data.buyerEmail}
        </dd>
        <dt>Tin đăng</dt>
        <dd>{data.listingTitle}</dd>
        <dt>Gói dịch vụ</dt>
        <dd>
          {data.planName} · {money(data.amount)}
        </dd>
        <dt>Trạng thái</dt>
        <dd>
          {statuses[data.status as keyof typeof statuses]} · {data.provider}
        </dd>
        <dt>Mã cổng / giao dịch</dt>
        <dd>
          {data.providerOrderCode ?? "—"} / {data.providerTransId ?? "—"}
        </dd>
        <dt>Ngày tạo / thanh toán</dt>
        <dd>
          {adminTime(data.createdAt)} /{" "}
          {data.paidAt ? adminTime(data.paidAt) : "—"}
        </dd>
      </dl>
      {data.boost && (
        <p>
          Đẩy tin từ {adminTime(data.boost.startsAt)} đến{" "}
          {adminTime(data.boost.endsAt)}.
        </p>
      )}
      {data.refund && (
        <p>
          Hoàn tiền: {data.refund.status} · {money(data.refund.amount)} ·{" "}
          <Link href="/admin/hoan-tien">Mở xử lý hoàn tiền ↗</Link>
        </p>
      )}
      <h3>Sự kiện thanh toán gần nhất</h3>
      {data.events?.length ? (
        <ol className="support-thread">
          {data.events.map((item) => (
            <li key={item.id}>
              <strong>Mã kết quả {item.resultCode}</strong>
              <p>{item.transId}</p>
              <small>{adminTime(item.receivedAt)}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">Chưa có sự kiện thanh toán.</p>
      )}
    </Card>
  );
}
export function AdminOrders({
  initialSearch = "",
}: {
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [input, setInput] = useState(initialSearch);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const { data, error, reload } = useAdminPage<AdminPage<Order>>(
    `/admin/orders?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`,
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(input.trim());
    setPage(1);
    setSelected("");
  }
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Tra cứu giao dịch</h1>
          <p className="text-muted">
            Đơn dịch vụ, kết quả thanh toán và lịch sử hoàn tiền.
          </p>
        </div>
        <Button variant="secondary" onClick={reload}>
          Tải lại
        </Button>
      </div>
      <form className="admin-filters" onSubmit={submit}>
        <Input
          id="order-search"
          label="Tìm giao dịch"
          value={input}
          maxLength={150}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Mã đơn, email, tên hoặc mã giao dịch"
        />
        <Select
          id="order-status"
          label="Trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            setSelected("");
          }}
        >
          <option value="">Tất cả</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit">Tìm kiếm</Button>
      </form>
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <div className={`admin-two-column${selected ? " has-detail" : ""}`}>
          <Card className="admin-list-card">
            <h2>{data.total} đơn dịch vụ</h2>
            {data.items.length ? (
              <div className="admin-report-list">
                {data.items.map((item) => (
                  <button
                    key={item.id}
                    className="admin-report-item"
                    type="button"
                    aria-pressed={selected === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <strong>
                      {item.buyerName} · {money(item.amount)}
                    </strong>
                    <span>{item.listingTitle}</span>
                    <small>
                      {statuses[item.status as keyof typeof statuses]} ·{" "}
                      {item.buyerEmail}
                    </small>
                    <small>{item.id}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="admin-empty">Không tìm thấy giao dịch.</p>
            )}
            <AdminPagination
              page={page}
              pages={data.pages}
              onPage={(value) => {
                setPage(value);
                setSelected("");
              }}
            />
          </Card>
          {selected && <OrderDetail key={selected} id={selected} />}
        </div>
      )}
    </section>
  );
}
