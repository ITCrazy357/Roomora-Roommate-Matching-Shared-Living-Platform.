"use client";
import { type FormEvent, useState } from "react";
import {
  adminError,
  adminMutation,
  adminTime,
  type AdminAction,
  type AdminPage,
  type AdminUser,
} from "@/lib/admin";
import { PersonAvatar } from "../person-avatar";
import { Button, Card, ErrorState, Input, Select, Textarea } from "../ui";
import {
  AdminHistory,
  AdminPagination,
  AdminResult,
  useAdminPage,
} from "./admin-shared";

export function AdminPerson({ user }: { user: AdminUser }) {
  return (
    <div className="admin-person">
      <PersonAvatar
        person={{
          displayName: user.profile?.displayName ?? user.email,
          avatarUrl: user.profile?.avatarUrl ?? null,
        }}
      />
      <span>
        <strong>{user.profile?.displayName ?? "Chưa có tên"}</strong>
        <small>{user.email}</small>
      </span>
    </div>
  );
}

export function AccountLockPanel({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => void;
}) {
  if (user.role === "ADMIN")
    return (
      <Card>
        <AdminPerson user={user} />
        <p className="text-muted">
          Tài khoản quản trị không thể bị khóa qua chức năng này.
        </p>
      </Card>
    );
  return <UserLockPanel user={user} onChanged={onChanged} />;
}

function UserLockPanel({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const {
    data: history,
    error: historyError,
    reload,
  } = useAdminPage<{ actions: AdminAction[] }>(
    `/admin/users/${user.id}/history`,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await adminMutation(`/admin/users/${user.id}/lock`, "PATCH", {
        locked: !user.lockedAt,
        version: user.moderationVersion,
        reason: reason.trim(),
      });
      onChanged();
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card className="admin-lock-panel">
      <AdminPerson user={user} />
      <span
        className={`admin-status ${user.lockedAt ? "is-danger" : "is-success"}`}
      >
        {user.lockedAt ? "Đang bị khóa" : "Đang hoạt động"}
      </span>
      {user.lockedAt && (
        <div className="admin-callout">
          <strong>Khóa từ {adminTime(user.lockedAt)}</strong>
          <p>{user.lockReason}</p>
        </div>
      )}
      <form className="form-stack" onSubmit={submit}>
        <h3>{user.lockedAt ? "Mở khóa tài khoản" : "Khóa do vi phạm"}</h3>
        <p className="text-muted text-sm">
          {user.lockedAt
            ? "Người dùng cần đăng nhập lại sau khi được mở khóa."
            : "Thu hồi mọi phiên đăng nhập và ẩn tin công khai. Giữ lịch sử để đối chiếu khi xử lý vi phạm."}
        </p>
        <Textarea
          id={`lock-reason-${user.id}`}
          label="Lý do xử lý"
          value={reason}
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <ErrorState message={error} />}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Đang lưu…"
            : user.lockedAt
              ? "Xác nhận mở khóa"
              : "Xác nhận khóa tài khoản"}
        </Button>
      </form>
      {history ? (
        <AdminHistory actions={history.actions} />
      ) : (
        <AdminResult error={historyError} reload={reload} />
      )}
    </Card>
  );
}

export function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const { data, error, reload } = useAdminPage<AdminPage<AdminUser>>(
    `/admin/users?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`,
  );
  const user = data?.items.find((item) => item.id === selected);
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Người dùng</h1>
          <p className="text-muted">
            Kiểm tra vi phạm và quản lý quyền sử dụng Roomora.
          </p>
        </div>
        <Button variant="secondary" onClick={reload}>
          Tải lại
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
          setSelected(null);
        }}
      >
        <Input
          id="admin-user-search"
          name="search"
          label="Tìm theo tên hoặc email"
          type="search"
          maxLength={120}
          placeholder="Nhập tên hoặc email…"
        />
        <Button type="submit" variant="secondary">
          Tìm kiếm
        </Button>
        <Select
          id="admin-user-status"
          label="Trạng thái tài khoản"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            setSelected(null);
          }}
        >
          <option value="">Tất cả</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="LOCKED">Đã khóa</option>
        </Select>
      </form>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <AdminResult error={error} reload={reload} />
      ) : (
        <div className={`admin-two-column${user ? " has-detail" : ""}`}>
          <Card className="admin-list-card">
            <div className="admin-list-title">
              <h2>{data.total} người dùng</h2>
              <span className="text-muted text-sm">
                Chọn tài khoản để xử lý
              </span>
            </div>
            {data.items.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Trạng thái</th>
                      <th>Tham gia</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          selected === item.id ? "is-selected" : undefined
                        }
                      >
                        <td>
                          <AdminPerson user={item} />
                        </td>
                        <td>
                          <span
                            className={`admin-status ${item.lockedAt ? "is-danger" : "is-success"}`}
                          >
                            {item.lockedAt ? "Đã khóa" : "Hoạt động"}
                          </span>
                          {!item.emailVerifiedAt && (
                            <small className="text-muted">
                              Chưa xác minh email
                            </small>
                          )}
                        </td>
                        <td>{adminTime(item.createdAt)}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelected(item.id);
                              setNotice("");
                            }}
                          >
                            {item.lockedAt ? "Xem / mở khóa" : "Xem / xử lý"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty">Không tìm thấy người dùng phù hợp.</p>
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
          {user && (
            <AccountLockPanel
              key={`${user.id}-${user.moderationVersion}`}
              user={user}
              onChanged={() => {
                setNotice(
                  user.lockedAt
                    ? "Đã mở khóa. Người dùng có thể đăng nhập lại."
                    : "Đã khóa và thu hồi các phiên đăng nhập.",
                );
                reload();
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}
