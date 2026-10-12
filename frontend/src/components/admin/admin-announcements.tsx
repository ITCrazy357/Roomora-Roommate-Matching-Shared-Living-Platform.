"use client";
import { type FormEvent, useState } from "react";
import {
  adminError,
  adminMutation,
  adminTime,
  announcementText,
  type AdminAction,
  type AdminPage,
  type Announcement,
} from "@/lib/admin";
import { Button, Card, ErrorState, Input, Select, Textarea } from "../ui";
import {
  AdminHistory,
  AdminPagination,
  AdminResult,
  useAdminClock,
  useAdminPage,
} from "./admin-shared";

// datetime-local inputs below always represent Vietnam time, independent of
// the administrator's browser timezone.
function vietnamInput(value: string | number) {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
function iso(value: FormDataEntryValue | null) {
  return new Date(`${value}:00+07:00`).toISOString();
}
function AnnouncementEditor({
  item,
  onSaved,
  onCancel,
}: {
  item: Announcement | null;
  onSaved: (item: Announcement) => void;
  onCancel: () => void;
}) {
  const [createdTime] = useState(() => Date.now());
  const [kind, setKind] = useState(item?.kind ?? "MAINTENANCE");
  const [title, setTitle] = useState(
    item?.title ?? "Thông báo bảo trì hệ thống",
  );
  const [message, setMessage] = useState(
    item?.message ??
      "Roomora sẽ tạm gián đoạn trong thời gian bảo trì. Vui lòng sắp xếp công việc trước thời gian này.",
  );
  const [maintenanceFrom, setMaintenanceFrom] = useState(
    item?.maintenanceFrom
      ? vietnamInput(item.maintenanceFrom)
      : vietnamInput(createdTime + 24 * 60 * 60 * 1000),
  );
  const [maintenanceUntil, setMaintenanceUntil] = useState(
    item?.maintenanceUntil
      ? vietnamInput(item.maintenanceUntil)
      : vietnamInput(createdTime + 25 * 60 * 60 * 1000),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const preview = announcementText({
    title,
    message,
    maintenanceFrom:
      kind === "MAINTENANCE" && maintenanceFrom ? iso(maintenanceFrom) : null,
    maintenanceUntil:
      kind === "MAINTENANCE" && maintenanceUntil ? iso(maintenanceUntil) : null,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
        kind,
        displayFrom: iso(form.get("displayFrom")),
        displayUntil: iso(form.get("displayUntil")),
        ...(kind === "MAINTENANCE"
          ? {
              maintenanceFrom: iso(maintenanceFrom),
              maintenanceUntil: iso(maintenanceUntil),
            }
          : {}),
        ...(item ? { version: item.version } : {}),
      };
      const saved = await adminMutation<Announcement>(
        item ? `/admin/announcements/${item.id}` : "/admin/announcements",
        item ? "PATCH" : "POST",
        payload,
      );
      onSaved(saved);
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="admin-announcement-editor">
      <div className="admin-list-title">
        <h2>{item ? "Chỉnh sửa bản nháp" : "Soạn thông báo mới"}</h2>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Đóng
        </Button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <fieldset disabled={pending}>
          <Select
            id="announcement-kind"
            label="Loại thông báo"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as Announcement["kind"])
            }
          >
            <option value="MAINTENANCE">Bảo trì hệ thống</option>
            <option value="GENERAL">Thông báo chung</option>
          </Select>
          <Input
            id="announcement-title"
            label="Tiêu đề"
            required
            minLength={3}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            id="announcement-message"
            label="Nội dung gửi mọi người"
            required
            minLength={5}
            maxLength={1000}
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="admin-time-grid">
            <Input
              id="announcement-display-from"
              name="displayFrom"
              label="Bắt đầu hiển thị (giờ VN)"
              type="datetime-local"
              required
              defaultValue={vietnamInput(item?.displayFrom ?? createdTime)}
            />
            <Input
              id="announcement-display-until"
              name="displayUntil"
              label="Kết thúc hiển thị (giờ VN)"
              type="datetime-local"
              required
              defaultValue={vietnamInput(
                item?.displayUntil ?? createdTime + 48 * 60 * 60 * 1000,
              )}
            />
          </div>
          {kind === "MAINTENANCE" && (
            <div className="admin-time-grid">
              <Input
                id="maintenance-from"
                label="Bảo trì từ (giờ VN)"
                type="datetime-local"
                required
                value={maintenanceFrom}
                onChange={(event) => setMaintenanceFrom(event.target.value)}
              />
              <Input
                id="maintenance-until"
                label="Bảo trì đến (giờ VN)"
                type="datetime-local"
                required
                value={maintenanceUntil}
                onChange={(event) => setMaintenanceUntil(event.target.value)}
              />
            </div>
          )}
        </fieldset>
        <div className="admin-preview">
          <span className="content-label">XEM TRƯỚC NỘI DUNG BANNER</span>
          <p>{preview}</p>
        </div>
        <p className="text-muted text-sm">
          Banner hiện trên mọi trang trong lịch hiển thị, kể cả trước đăng nhập.
          Thông báo không tự tắt hệ thống hay khóa người dùng.
        </p>
        {error && <ErrorState message={error} />}
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu bản nháp"}
        </Button>
      </form>
    </Card>
  );
}

function AnnouncementHistory({ id }: { id: string }) {
  const { data, error, reload } = useAdminPage<{ actions: AdminAction[] }>(
    `/admin/announcements/${id}/history`,
  );
  return (
    <Card>
      {data ? (
        <AdminHistory actions={data.actions} />
      ) : (
        <AdminResult error={error} reload={reload} />
      )}
    </Card>
  );
}

export function AdminAnnouncements() {
  const now = useAdminClock();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Announcement | null | undefined>(
    undefined,
  );
  const [editorKey, setEditorKey] = useState(0);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const {
    data,
    error: loadError,
    reload,
  } = useAdminPage<AdminPage<Announcement>>(
    `/admin/announcements?page=${page}`,
  );
  async function publish(item: Announcement) {
    setPendingId(item.id);
    setError("");
    setNotice("");
    try {
      await adminMutation(
        `/admin/announcements/${item.id}/${item.published ? "withdraw" : "publish"}`,
        "POST",
        { version: item.version },
      );
      setNotice(
        item.published
          ? "Đã gỡ thông báo khỏi banner toàn hệ thống."
          : "Đã phát thông báo theo lịch. Các giao diện đang mở cập nhật trong tối đa 20 giây.",
      );
      reload();
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPendingId(null);
    }
  }
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Thông báo & bảo trì</h1>
          <p className="text-muted">
            Soạn nội dung, chọn lịch và phát banner tới mọi người.
          </p>
        </div>
        <div className="admin-actions">
          <Button variant="secondary" onClick={reload}>
            Tải lại
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setEditorKey((old) => old + 1);
              setNotice("");
            }}
          >
            + Soạn thông báo
          </Button>
        </div>
      </div>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorState message={error} />}
      {editing !== undefined && (
        <AnnouncementEditor
          key={editorKey}
          item={editing}
          onCancel={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setNotice(
              "Đã lưu bản nháp. Kiểm tra nội dung bên dưới rồi bấm Phát theo lịch.",
            );
            setPage(1);
            reload();
          }}
        />
      )}
      {!data ? (
        <AdminResult error={loadError} reload={reload} />
      ) : (
        <>
          <div className="admin-announcement-list">
            {data.items.map((item) => {
              const expired = new Date(item.displayUntil).getTime() <= now;
              const scheduled = new Date(item.displayFrom).getTime() > now;
              const label = !item.published
                ? "Bản nháp / Đã gỡ"
                : expired
                  ? "Đã kết thúc"
                  : scheduled
                    ? "Đã lên lịch"
                    : "Đang hiển thị";
              return (
                <Card key={item.id} className="admin-announcement-card">
                  <div className="admin-list-title">
                    <span
                      className={`admin-status ${item.published && !expired ? "is-success" : "is-neutral"}`}
                    >
                      {label}
                    </span>
                    <small className="text-muted">
                      {item.kind === "MAINTENANCE"
                        ? "Bảo trì hệ thống"
                        : "Thông báo chung"}
                    </small>
                  </div>
                  <h2>{item.title}</h2>
                  <div className="admin-preview">
                    <p>{announcementText(item)}</p>
                  </div>
                  <p className="text-muted text-sm">
                    Hiển thị: {adminTime(item.displayFrom)} →{" "}
                    {adminTime(item.displayUntil)} (giờ VN)
                  </p>
                  <div className="admin-actions">
                    <Button
                      disabled={
                        Boolean(pendingId) || (!item.published && expired)
                      }
                      onClick={() => void publish(item)}
                    >
                      {pendingId === item.id
                        ? "Đang lưu…"
                        : item.published
                          ? "Gỡ khỏi banner"
                          : "Phát theo lịch"}
                    </Button>
                    {!item.published && (
                      <Button
                        variant="secondary"
                        disabled={Boolean(pendingId)}
                        onClick={() => {
                          setEditing(item);
                          setEditorKey((old) => old + 1);
                        }}
                      >
                        Sửa bản nháp
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setHistoryId(historyId === item.id ? null : item.id)
                      }
                    >
                      Lịch sử
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          {!data.items.length && (
            <Card className="admin-empty">
              <h2>Chưa có thông báo hệ thống</h2>
              <p>
                Soạn thông báo bảo trì hoặc thông tin chung khi cần gửi tới mọi
                người.
              </p>
            </Card>
          )}
          <AdminPagination page={page} pages={data.pages} onPage={setPage} />
        </>
      )}
      {historyId && <AnnouncementHistory id={historyId} />}
    </section>
  );
}
