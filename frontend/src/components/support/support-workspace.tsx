"use client";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { adminTime, type AdminPage } from "@/lib/admin";
import {
  supportError,
  supportStatuses,
  type SupportTicket,
} from "@/lib/support";
import { Button, Card, ErrorState, Input, Select, Textarea } from "../ui";
import { ListingAccess } from "../listings/listing-access";
import {
  AdminPagination,
  AdminResult,
  useAdminPage,
} from "../admin/admin-shared";
import { AdminHistory } from "../admin/admin-shared";
import type { AdminAction } from "@/lib/admin";

function TicketHistory({ id }: { id: string }) {
  const { data, error, reload } = useAdminPage<AdminPage<AdminAction>>(
    `/admin/audit?entityId=${id}`,
  );
  return data ? (
    <AdminHistory actions={data.items} />
  ) : (
    <AdminResult error={error} reload={reload} />
  );
}

function TicketDetail({
  id,
  admin,
  onChanged,
}: {
  id: string;
  admin: boolean;
  onChanged: () => void;
}) {
  const base = admin ? "/admin/support/tickets" : "/support/tickets";
  const {
    data: ticket,
    error,
    reload,
  } = useAdminPage<SupportTicket>(`${base}/${id}`);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("IN_PROGRESS");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticket) return;
    const close =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)
        ?.value === "close";
    setPending(true);
    setFailure("");
    try {
      await apiFetch(
        `${base}/${id}${admin ? "" : close ? "/close" : "/replies"}`,
        {
          method: admin ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: ticket.version,
            body: body.trim(),
            ...(admin ? { status } : {}),
          }),
        },
      );
      setBody("");
      reload();
      onChanged();
      window.dispatchEvent(new Event("roomora:admin-change"));
    } catch (error) {
      setFailure(supportError(error));
    } finally {
      setPending(false);
    }
  }
  if (!ticket) return <AdminResult error={error} reload={reload} />;
  return (
    <Card className="support-detail">
      <h2>{ticket.subject}</h2>
      <p className="text-muted">
        {supportStatuses[ticket.status]} · Phiên bản {ticket.version}
      </p>
      {admin && (
        <p>
          Người gửi: {ticket.user.profile?.displayName ?? ticket.user.email} ·{" "}
          {ticket.user.email}
        </p>
      )}
      {ticket.order && (
        <p>
          Đơn dịch vụ:{" "}
          {admin ? (
            <Link href={`/admin/giao-dich?search=${ticket.order.id}`}>
              {ticket.order.id}
            </Link>
          ) : (
            <Link href="/dich-vu?tab=history">{ticket.order.id}</Link>
          )}{" "}
          · {ticket.order.planName}
        </p>
      )}
      <ol className="support-thread">
        {ticket.messages?.map((message) => (
          <li
            key={message.id}
            className={message.fromAdmin ? "from-admin" : ""}
          >
            <strong>
              {message.fromAdmin ? "Hỗ trợ Roomora" : "Người gửi"}
            </strong>
            <small>{adminTime(message.createdAt)}</small>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status !== "CLOSED" && (
        <form className="form-stack" onSubmit={submit}>
          {admin && (
            <Select
              id="support-decision"
              label="Trạng thái sau phản hồi"
              value={status}
              disabled={pending}
              onChange={(event) => setStatus(event.target.value)}
            >
              {Object.entries(supportStatuses)
                .filter(([value]) => value !== "OPEN")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          )}
          <Textarea
            id="support-reply"
            label={
              admin
                ? "Phản hồi và căn cứ xử lý"
                : "Bổ sung nội dung hoặc lý do đóng"
            }
            required
            minLength={5}
            maxLength={2000}
            rows={4}
            value={body}
            disabled={pending}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="admin-actions">
            <Button type="submit" disabled={pending}>
              Gửi phản hồi
            </Button>
            {!admin && (
              <Button
                type="submit"
                value="close"
                variant="secondary"
                disabled={pending}
              >
                Đóng yêu cầu
              </Button>
            )}
          </div>
          {!admin && ticket.status === "RESOLVED" && (
            <p className="text-muted">
              Gửi phản hồi để mở lại nếu vấn đề chưa được giải quyết.
            </p>
          )}
          {failure && <ErrorState message={failure} />}
        </form>
      )}
      {admin && <TicketHistory id={id} />}
    </Card>
  );
}

function Workspace({ admin }: { admin: boolean }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const base = admin ? "/admin/support/tickets" : "/support/tickets";
  const { data, error, reload } = useAdminPage<AdminPage<SupportTicket>>(
    `${base}?page=${page}${status ? `&status=${status}` : ""}`,
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailure("");
    try {
      const ticket = await apiFetch<SupportTicket>(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.get("subject"),
          body: form.get("body"),
          ...(form.get("orderId")
            ? { orderId: String(form.get("orderId")).trim() }
            : {}),
        }),
      });
      setCreating(false);
      setStatus("");
      setPage(1);
      setSelected(ticket.id);
      reload();
    } catch (error) {
      setFailure(supportError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="admin-page support-workspace">
      <div className="admin-page-heading">
        <div>
          <h1>Yêu cầu hỗ trợ</h1>
          <p className="text-muted">
            {admin
              ? "Theo dõi trao đổi, bổ sung thông tin và ghi nhận kết quả xử lý."
              : "Gửi vấn đề bạn gặp và theo dõi phản hồi từ Roomora."}
          </p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={reload}>
            Tải lại
          </Button>
          {!admin && (
            <Button
              onClick={() => {
                setCreating(!creating);
                setSelected("");
              }}
            >
              Gửi yêu cầu mới
            </Button>
          )}
        </div>
      </div>
      <div className="admin-filters">
        <Select
          id="support-filter"
          label="Trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            setSelected("");
          }}
        >
          <option value="">Tất cả</option>
          {Object.entries(supportStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      {creating && (
        <Card>
          <form className="form-stack" onSubmit={create}>
            <Input
              id="support-subject"
              name="subject"
              label="Bạn cần hỗ trợ việc gì?"
              required
              minLength={5}
              maxLength={150}
            />
            <Textarea
              id="support-body"
              name="body"
              label="Nội dung"
              required
              minLength={10}
              maxLength={2000}
              rows={5}
            />
            <Input
              id="support-order"
              name="orderId"
              label="Mã đơn dịch vụ (nếu có)"
              maxLength={36}
              hint="Sao chép mã trong lịch sử Dịch vụ Roomora."
            />
            <Button type="submit" disabled={pending}>
              Gửi yêu cầu
            </Button>
            {failure && <ErrorState message={failure} />}
          </form>
        </Card>
      )}
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <div className={`admin-two-column${selected ? " has-detail" : ""}`}>
          <Card className="admin-list-card">
            <h2>{data.total} yêu cầu</h2>
            {data.items.length ? (
              <div className="admin-report-list">
                {data.items.map((ticket) => (
                  <button
                    className="admin-report-item"
                    key={ticket.id}
                    type="button"
                    aria-pressed={selected === ticket.id}
                    onClick={() => {
                      setSelected(ticket.id);
                      setCreating(false);
                    }}
                  >
                    <strong>{ticket.subject}</strong>
                    <span>{supportStatuses[ticket.status]}</span>
                    <small>
                      {adminTime(ticket.updatedAt)}
                      {admin ? ` · ${ticket.user.email}` : ""}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="admin-empty">
                Chưa có yêu cầu trong danh sách này.
              </p>
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
          {selected && (
            <TicketDetail
              key={selected}
              id={selected}
              admin={admin}
              onChanged={reload}
            />
          )}
        </div>
      )}
    </section>
  );
}
export function SupportWorkspace({ admin = false }: { admin?: boolean }) {
  return admin ? (
    <Workspace admin />
  ) : (
    <ListingAccess>
      <div className="container page-section">
        <Workspace admin={false} />
      </div>
    </ListingAccess>
  );
}
