"use client";
import { type FormEvent, useState } from "react";
import Link from "next/link";
import {
  adminError,
  adminMutation,
  adminTime,
  reportReasons,
  reportStatuses,
  type AdminPage,
  type AdminAction,
  type AdminReport,
} from "@/lib/admin";
import { Button, Card, ErrorState, Select, Textarea } from "../ui";
import { AccountLockPanel, AdminPerson } from "./admin-users";
import {
  AdminHistory,
  AdminPagination,
  AdminResult,
  useAdminPage,
} from "./admin-shared";

function ReportDetail({
  report,
  onChanged,
}: {
  report: AdminReport;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [removeListing, setRemoveListing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { data: history } = useAdminPage<{ actions: AdminAction[] }>(
    `/admin/reports/${report.id}/history`,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const status = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
    )?.value;
    if (status !== "RESOLVED" && status !== "DISMISSED") return;
    setPending(true);
    setError("");
    try {
      await adminMutation(`/admin/reports/${report.id}`, "PATCH", {
        status,
        version: report.version,
        note: note.trim(),
        ...(status === "RESOLVED" && removeListing
          ? { removeListing: true, listingVersion: report.listing?.version }
          : {}),
      });
      onChanged();
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="admin-report-detail">
      <Card>
        <span className="content-label">NỘI DUNG BÁO CÁO</span>
        <h2>{reportReasons[report.reason]}</h2>
        <p className="admin-report-text">{report.details}</p>
        {report.listingSnapshot && (
          <div className="admin-callout">
            <h3>Tin đăng lúc gửi báo cáo</h3>
            <strong>{report.listingSnapshot.title}</strong>
            <p className="admin-report-text">
              {report.listingSnapshot.description}
            </p>
            <p>
              Phiên bản {report.listingSnapshot.version} · Hiện tại:{" "}
              {report.listing?.status ?? "Không còn hiển thị"}
            </p>
            {report.listing && !report.listing.deletedAt && (
              <Link href={`/admin/tin-dang/${report.listing.id}`}>
                Xem nội dung hiện tại ↗
              </Link>
            )}
          </div>
        )}
        <p className="text-muted text-sm">
          Gửi lúc {adminTime(report.createdAt)}
        </p>
        <h3>Người gửi báo cáo</h3>
        <AdminPerson user={report.reporter} />
        {report.status === "OPEN" ? (
          <form className="form-stack" onSubmit={submit}>
            {report.listing?.status === "PUBLISHED" && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={removeListing}
                  disabled={pending}
                  onChange={(event) => setRemoveListing(event.target.checked)}
                />
                <span>
                  Gỡ tin vi phạm khi chọn “Đã xử lý vi phạm”. Chủ tin phải gửi
                  duyệt lại.
                </span>
              </label>
            )}
            <Textarea
              id="report-handling-note"
              label="Kết quả kiểm tra và lý do xử lý"
              required
              minLength={5}
              maxLength={1000}
              rows={4}
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
              hint="Ghi rõ căn cứ. Nếu cần khóa tài khoản, thực hiện ở phần bên dưới trước khi đóng báo cáo."
            />
            {error && <ErrorState message={error} />}
            <div className="admin-actions">
              <Button type="submit" value="RESOLVED" disabled={pending}>
                Đã xử lý vi phạm
              </Button>
              <Button
                type="submit"
                variant="secondary"
                value="DISMISSED"
                disabled={pending}
              >
                Không đủ căn cứ
              </Button>
            </div>
          </form>
        ) : (
          <div className="admin-callout">
            <strong>{reportStatuses[report.status]}</strong>
            <p>{report.handlingNote}</p>
            {report.handledAt && <small>{adminTime(report.handledAt)}</small>}
          </div>
        )}
      </Card>
      {history && history.actions.length > 0 && (
        <Card>
          <AdminHistory actions={history.actions} />
        </Card>
      )}
      <AccountLockPanel
        key={`${report.target.id}-${report.target.moderationVersion}`}
        user={report.target}
        onChanged={onChanged}
      />
    </div>
  );
}

export function AdminReports() {
  const [status, setStatus] = useState<AdminReport["status"]>("OPEN");
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const { data, error, reload } = useAdminPage<AdminPage<AdminReport>>(
    `/admin/reports?page=${page}&status=${status}${type ? `&type=${type}` : ""}`,
  );
  const report = data?.items.find((item) => item.id === selected);
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Báo cáo vi phạm</h1>
          <p className="text-muted">
            Xem nội dung, kiểm tra căn cứ rồi quyết định xử lý.
          </p>
        </div>
        <Button variant="secondary" onClick={reload}>
          Tải lại
        </Button>
      </div>
      <div className="admin-filters">
        <Select
          id="report-type"
          label="Đối tượng báo cáo"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
            setSelected(null);
          }}
        >
          <option value="">Tất cả</option>
          <option value="USER">Người dùng</option>
          <option value="LISTING">Tin đăng</option>
        </Select>
        <Select
          id="admin-report-status"
          label="Trạng thái báo cáo"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as AdminReport["status"]);
            setPage(1);
            setSelected(null);
            setNotice("");
          }}
        >
          {Object.entries(reportStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <p className="text-muted text-sm">
          Báo cáo cũ được xếp trước. Báo cáo không tự động khóa tài khoản.
        </p>
      </div>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <div className={`admin-two-column${report ? " has-detail" : ""}`}>
          <Card className="admin-list-card">
            <h2>
              {data.total} báo cáo {reportStatuses[status].toLowerCase()}
            </h2>
            {data.items.length ? (
              <div className="admin-report-list">
                {data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="admin-report-item"
                    aria-pressed={selected === item.id}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="admin-status is-warning">
                      {reportReasons[item.reason]}
                    </span>
                    <strong>
                      {item.listingSnapshot?.title ??
                        item.target.profile?.displayName ??
                        item.target.email}
                    </strong>
                    <span className="admin-report-excerpt">{item.details}</span>
                    <small>
                      {adminTime(item.createdAt)} · Người báo cáo:{" "}
                      {item.reporter.profile?.displayName ?? "Người dùng"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="admin-empty">
                <h3>
                  {status === "OPEN"
                    ? "Không có báo cáo đang chờ"
                    : "Chưa có báo cáo trong danh sách này"}
                </h3>
                <p>Các báo cáo do người dùng gửi sẽ xuất hiện tại đây.</p>
              </div>
            )}
            <AdminPagination
              page={page}
              pages={data.pages}
              onPage={(value) => {
                setPage(value);
                setSelected(null);
              }}
            />
          </Card>
          {report && (
            <ReportDetail
              key={`${report.id}-${report.version}`}
              report={report}
              onChanged={() => {
                setNotice("Đã lưu quyết định và lịch sử xử lý.");
                reload();
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
