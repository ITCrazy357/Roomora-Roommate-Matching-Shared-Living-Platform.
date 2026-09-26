"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  Select,
} from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import type { MyProfile } from "@/lib/profile";

interface LoginSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export function SettingsPanel() {
  const router = useRouter();
  const auth = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      router.replace("/dang-nhap");
      return;
    }
    const controller = new AbortController();
    Promise.all([
      apiFetch<MyProfile>("/profiles/me", { signal: controller.signal }),
      apiFetch<{ sessions: LoginSession[] }>("/auth/sessions", {
        signal: controller.signal,
      }),
    ])
      .then(([profileResult, sessionResult]) => {
        setProfile(profileResult);
        setSessions(sessionResult.sessions);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(authErrorMessage(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.loading, auth.user, router]);

  async function savePrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    const data = new FormData(event.currentTarget);
    try {
      const updated = await apiFetch<MyProfile>("/profiles/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: data.get("visibility"),
          showBudget: data.has("showBudget"),
          showDesiredAreas: data.has("showDesiredAreas"),
          showLifestyle: data.has("showLifestyle"),
        }),
      });
      setProfile((current) => ({ ...current!, ...updated }));
      setSaved(true);
    } catch (saveError) {
      setError(authErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  }

  async function revoke(sessionId: string) {
    setError("");
    try {
      await apiFetch<void>(`/auth/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((current) =>
        current.filter((session) => session.id !== sessionId),
      );
    } catch (revokeError) {
      setError(authErrorMessage(revokeError));
    }
  }

  async function logoutEverywhere() {
    setPending(true);
    try {
      await apiFetch<void>("/auth/logout-all", { method: "POST" });
      auth.setUser(null);
      router.replace("/dang-nhap");
      router.refresh();
    } catch (logoutError) {
      setError(authErrorMessage(logoutError));
      setPending(false);
    }
  }

  if (loading || auth.loading)
    return <LoadingState message="Đang tải cài đặt…" />;
  if (!profile)
    return <ErrorState message={error || "Không thể tải cài đặt."} />;

  return (
    <div className="settings-grid">
      <Card className="settings-card">
        <span className="eyebrow">HỒ SƠ CÔNG KHAI</span>
        <h2>Ai có thể xem gì?</h2>
        <form className="form-stack" onSubmit={savePrivacy}>
          <Select
            id="visibility"
            name="visibility"
            label="Chế độ hồ sơ"
            defaultValue={profile.visibility}
          >
            <option value="PUBLIC">Công khai</option>
            <option value="PRIVATE">Riêng tư</option>
          </Select>
          <label className="check-row">
            <input
              type="checkbox"
              name="showBudget"
              defaultChecked={profile.showBudget}
            />
            <span>Hiển thị khoảng ngân sách</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              name="showDesiredAreas"
              defaultChecked={profile.showDesiredAreas}
            />
            <span>Hiển thị khu vực mong muốn</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              name="showLifestyle"
              defaultChecked={profile.showLifestyle}
            />
            <span>Hiển thị thói quen sinh hoạt</span>
          </label>
          {saved && <div className="success-state">Đã lưu quyền riêng tư.</div>}
          <Button type="submit" disabled={pending}>
            Lưu cài đặt
          </Button>
        </form>
      </Card>

      <Card className="settings-card">
        <span className="eyebrow">PHIÊN ĐĂNG NHẬP</span>
        <h2>Thiết bị đang hoạt động</h2>
        <div className="session-list">
          {sessions.map((session) => (
            <article className="session-item" key={session.id}>
              <div>
                <strong>
                  {session.current ? "Thiết bị hiện tại" : "Thiết bị khác"}
                </strong>
                <p className="text-muted text-sm">
                  {session.userAgent || "Không rõ trình duyệt"}
                </p>
                <p className="text-muted text-sm">
                  Hoạt động:{" "}
                  {new Date(session.lastSeenAt).toLocaleString("vi-VN")}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="secondary"
                  onClick={() => void revoke(session.id)}
                >
                  Thu hồi
                </Button>
              )}
            </article>
          ))}
        </div>
        <Button
          variant="secondary"
          onClick={() => void logoutEverywhere()}
          disabled={pending}
        >
          Đăng xuất khỏi tất cả thiết bị
        </Button>
      </Card>
      {error && <div className="error-state settings-error">{error}</div>}
    </div>
  );
}
