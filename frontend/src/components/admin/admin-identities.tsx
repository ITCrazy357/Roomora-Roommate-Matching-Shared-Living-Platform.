"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { adminTime, type AdminAction, type AdminPage } from "@/lib/admin";
import {
  identityError,
  identityStatuses,
  type IdentityFields,
  type IdentityRecord,
} from "@/lib/identity";
import { Button, Card, ErrorState, Input, Select, Textarea } from "../ui";
import {
  AdminHistory,
  AdminPagination,
  AdminResult,
  useAdminPage,
} from "./admin-shared";
import { AdminPerson } from "./admin-users";
import { IdentityBadge } from "../identity/identity-badge";

function IdentityHistory({ id }: { id: string }) {
  const { data, error, reload } = useAdminPage<AdminPage<AdminAction>>(
    `/admin/audit?entityId=${encodeURIComponent(id)}`,
  );
  return (
    <Card>
      {data ? (
        <AdminHistory actions={data.items} />
      ) : (
        <AdminResult error={error} reload={reload} />
      )}
    </Card>
  );
}

function Detail({ id }: { id: string }) {
  const {
    data: record,
    error,
    reload,
  } = useAdminPage<IdentityRecord>(
    `/admin/identities/${encodeURIComponent(id)}`,
  );
  const [historyRevision, setHistoryRevision] = useState(0);
  const reloadHistory = () => setHistoryRevision((value) => value + 1);
  const [revealed, setRevealed] = useState<{
    version: number;
    fields: IdentityFields;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const fields =
    revealed?.version === record?.version ? revealed?.fields : null;
  useEffect(() => {
    if (!revealed) return;
    const clear = () => {
      if (document.visibilityState === "hidden") setRevealed(null);
    };
    const timer = setTimeout(() => setRevealed(null), 60_000);
    document.addEventListener("visibilitychange", clear);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [revealed]);

  async function reveal(event: FormEvent) {
    event.preventDefault();
    if (!record || pending) return;
    setPending(true);
    setFailure("");
    try {
      const value = await apiFetch<{ version: number; fields: IdentityFields }>(
        `/admin/identities/${id}/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: record.version,
            reason: reason.trim(),
          }),
        },
      );
      setRevealed(value);
      setReason("");
      reloadHistory();
    } catch (error) {
      setFailure(identityError(error));
    } finally {
      setPending(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!record || pending) return;
    const status = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
    )?.value;
    if (status !== "APPROVED" && status !== "REJECTED") return;
    setPending(true);
    setFailure("");
    setNotice("");
    try {
      await apiFetch(`/admin/identities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: record.version,
          status,
          reason: note.trim(),
        }),
      });
      setRevealed(null);
      setNote("");
      setNotice("Đã lưu kết quả kiểm tra hồ sơ demo.");
      reload();
      reloadHistory();
      window.dispatchEvent(new Event("roomora:admin-change"));
    } catch (error) {
      setFailure(identityError(error));
      reload();
    } finally {
      setPending(false);
    }
  }
  if (!record) return <AdminResult error={error} reload={reload} />;
  return (
    <div className="form-stack">
      <Card className="form-stack">
        <h2>Hồ sơ khai báo</h2>
        {record.user && <AdminPerson user={record.user} />}
        <IdentityBadge status={record.status} />
        <p className="text-muted">
          Nộp {adminTime(record.submittedAt)} · Phiên bản {record.version}
        </p>
        <p className="listing-privacy">
          Thông tin tự khai cho demo. Duyệt hồ sơ thủ công không đồng nghĩa với
          xác minh RAR/VNeID.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Thông tin</th>
                <th>Phạm vi truy cập</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Trạng thái hồ sơ</td>
                <td>{identityStatuses[record.status]}</td>
              </tr>
              <tr>
                <td>Họ và tên khai báo</td>
                <td>{fields?.fullName ?? "Ẩn · chỉ mở khi có lý do"}</td>
              </tr>
              <tr>
                <td>Số CCCD</td>
                <td>{fields?.documentNumber ?? record.documentMasked}</td>
              </tr>
              <tr>
                <td>Ngày sinh</td>
                <td>{fields?.birthDate ?? "Ẩn"}</td>
              </tr>
              <tr>
                <td>Điện thoại</td>
                <td>{fields?.phone ?? "Ẩn"}</td>
              </tr>
              <tr>
                <td>Địa chỉ liên hệ</td>
                <td>{fields?.contactAddress ?? "Ẩn"}</td>
              </tr>
              <tr>
                <td>Ảnh CCCD gốc</td>
                <td>Không thu thập trong demo</td>
              </tr>
              <tr>
                <td>Khuôn mặt / sinh trắc học</td>
                <td>Không thu thập trong demo</td>
              </tr>
              <tr>
                <td>Kết quả API xác thực</td>
                <td>Chưa tích hợp dịch vụ chính thức</td>
              </tr>
            </tbody>
          </table>
        </div>
        {fields ? (
          <>
            <p className="text-muted text-sm">
              Thông tin tự ẩn sau 60 giây hoặc khi chuyển sang tab khác.
            </p>
            <Button variant="secondary" onClick={() => setRevealed(null)}>
              Ẩn thông tin
            </Button>
          </>
        ) : (
          <form className="form-stack" onSubmit={reveal}>
            <Textarea
              id="identity-access-reason"
              label="Lý do cần xem thông tin đầy đủ"
              required
              minLength={5}
              maxLength={1000}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              hint="Mỗi lần mở đều lưu người truy cập, thời điểm và lý do trong nhật ký."
            />
            <Button type="submit" variant="secondary" disabled={pending}>
              Mở thông tin có ghi nhật ký
            </Button>
          </form>
        )}
        {record.reviewNote && <p>Ghi chú đã lưu: {record.reviewNote}</p>}
        <form className="form-stack" onSubmit={review}>
          <Textarea
            id="identity-review-note"
            label="Ghi chú kiểm tra hồ sơ demo"
            required
            minLength={5}
            maxLength={1000}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
          />
          <div className="admin-actions">
            <Button
              type="submit"
              value="APPROVED"
              disabled={pending || record.status === "APPROVED"}
            >
              Duyệt hồ sơ demo
            </Button>
            <Button
              type="submit"
              variant="secondary"
              value="REJECTED"
              disabled={pending || record.status === "REJECTED"}
            >
              Yêu cầu bổ sung
            </Button>
          </div>
        </form>
        {notice && (
          <p className="success-state" role="status">
            {notice}
          </p>
        )}
        {failure && <ErrorState message={failure} />}
      </Card>
      <IdentityHistory key={`${record.version}-${historyRevision}`} id={id} />
    </div>
  );
}

export function AdminIdentities({
  initialUserId = "",
}: {
  initialUserId?: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(initialUserId);
  const { data, error, reload } = useAdminPage<AdminPage<IdentityRecord>>(
    `/admin/identities?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`,
  );
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Tra cứu hồ sơ</h1>
          <p className="text-muted">
            Quản lý khai báo demo, kiểm tra thông tin theo nhu cầu và theo dõi
            lịch sử truy cập.
          </p>
        </div>
        <Button variant="secondary" onClick={reload}>
          Tải lại danh sách
        </Button>
      </div>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(
            String(
              new FormData(event.currentTarget).get("search") ?? "",
            ).trim(),
          );
          setPage(1);
        }}
      >
        <Input
          id="identity-search"
          name="search"
          label="Tên hiển thị hoặc email"
          maxLength={120}
          type="search"
        />
        <Button type="submit" variant="secondary">
          Tìm hồ sơ
        </Button>
        <Select
          id="identity-status-filter"
          label="Trạng thái hồ sơ"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {Object.entries(identityStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </form>
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <div className={`admin-two-column${selected ? " has-detail" : ""}`}>
          <Card className="admin-list-card">
            <h2>{data.total} hồ sơ đã khai báo</h2>
            <div className="admin-report-list">
              {data.items.map((record) => (
                <button
                  key={record.userId}
                  className="admin-report-item"
                  aria-pressed={selected === record.userId}
                  onClick={() => setSelected(record.userId)}
                >
                  <strong>
                    {record.user?.profile?.displayName ?? record.user?.email}
                  </strong>
                  <span>{record.user?.email}</span>
                  <span>
                    {record.documentMasked} · {identityStatuses[record.status]}
                  </span>
                  <small>{adminTime(record.submittedAt)}</small>
                </button>
              ))}
            </div>
            {!data.items.length && (
              <p className="admin-empty">
                Không có hồ sơ phù hợp. Người chưa khai báo sẽ chưa xuất hiện
                trong danh sách này.
              </p>
            )}
            <AdminPagination page={page} pages={data.pages} onPage={setPage} />
          </Card>
          {selected && <Detail key={selected} id={selected} />}
        </div>
      )}
    </section>
  );
}
