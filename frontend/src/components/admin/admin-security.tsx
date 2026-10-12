"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { adminError, adminTime } from "@/lib/admin";
import { useAuth } from "../auth-provider";
import { Button, Card, ErrorState } from "../ui";
import { GoogleAuthNotice } from "../google-auth-notice";
import { GoogleAccountCard } from "@/app/tai-khoan/cai-dat/google-account-card";
import { AdminResult, useAdminPage } from "./admin-shared";
interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  current: boolean;
}
export function AdminSecurity() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const {
    data,
    error: loadError,
    reload,
  } = useAdminPage<{ sessions: Session[] }>("/auth/sessions");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function revoke(id?: string) {
    setPending(true);
    setError("");
    try {
      await apiFetch(id ? `/auth/sessions/${id}` : "/auth/logout-all", {
        method: id ? "DELETE" : "POST",
      });
      if (id) reload();
      else {
        setUser(null);
        router.replace("/dang-nhap");
      }
    } catch (error) {
      setError(adminError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <div>
          <h1>Bảo mật tài khoản</h1>
          <p className="text-muted">{user?.email}</p>
        </div>
        {user?.hasPassword && (
          <Link className="button button-secondary" href="/quen-mat-khau">
            Đặt lại mật khẩu
          </Link>
        )}
      </div>
      <GoogleAuthNotice />
      {error && <ErrorState message={error} />}
      {!data ? (
        <AdminResult error={loadError} reload={reload} />
      ) : (
        <Card>
          <div className="admin-list-title">
            <h2>Phiên đăng nhập</h2>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void revoke()}
            >
              Đăng xuất mọi thiết bị
            </Button>
          </div>
          <div className="admin-session-list">
            {data.sessions.map((session) => (
              <div key={session.id}>
                <span>
                  <strong>
                    {session.current ? "Thiết bị hiện tại" : "Thiết bị khác"}
                  </strong>
                  <small>
                    {session.userAgent ?? "Không xác định thiết bị"}
                  </small>
                  <small>
                    {session.ipAddress} · Hoạt động{" "}
                    {adminTime(session.lastSeenAt)}
                  </small>
                </span>
                {!session.current && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => void revoke(session.id)}
                  >
                    Thu hồi phiên
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      <GoogleAccountCard />
    </section>
  );
}
