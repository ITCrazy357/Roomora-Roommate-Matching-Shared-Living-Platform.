"use client";

import { useEffect, useState } from "react";
import { ButtonLink, Card, ErrorState, LoadingState } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import { lifestyleLabels } from "@/lib/profile";

interface PublicProfileData {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  desiredAreas?: string[];
  sleepSchedule?: string | null;
  smokingPreference?: string | null;
  petPreference?: string | null;
  quietLevel?: string | null;
}

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function PublicProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<PublicProfileData>(`/profiles/${userId}`)
      .then(setProfile)
      .catch((fetchError) =>
        setError(
          fetchError instanceof ApiError && fetchError.status === 404
            ? "Hồ sơ không tồn tại hoặc đang ở chế độ riêng tư."
            : authErrorMessage(fetchError),
        ),
      )
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading)
    return (
      <div className="container page-section">
        <LoadingState />
      </div>
    );
  if (!profile) {
    return (
      <div className="container page-section narrow">
        <ErrorState
          message={error || "Hồ sơ không tồn tại hoặc đang ở chế độ riêng tư."}
          action={<ButtonLink href="/tim-nguoi-o-ghep">Quay lại</ButtonLink>}
        />
      </div>
    );
  }

  const lifestyle = [
    profile.sleepSchedule,
    profile.smokingPreference,
    profile.petPreference,
    profile.quietLevel,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="container public-profile-page">
      <Card className="public-profile-card">
        <div className="avatar-large" aria-hidden={!profile.avatarUrl}>
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={`Ảnh đại diện của ${profile.displayName}`}
            />
          ) : (
            profile.displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="public-profile-copy">
          <span className="eyebrow">HỒ SƠ ROOMORA</span>
          <h1>{profile.displayName}</h1>
          <p className="text-muted">
            {profile.bio || "Người dùng này chưa thêm phần giới thiệu."}
          </p>
        </div>
      </Card>
      <div className="profile-summary-grid">
        {profile.desiredAreas && (
          <Card className="summary-card">
            <h2>Khu vực mong muốn</h2>
            <p>{profile.desiredAreas.join(", ") || "Chưa cập nhật"}</p>
          </Card>
        )}
        {(profile.budgetMin !== undefined ||
          profile.budgetMax !== undefined) && (
          <Card className="summary-card">
            <h2>Ngân sách</h2>
            <p>
              {profile.budgetMin !== null && profile.budgetMin !== undefined
                ? currency.format(profile.budgetMin)
                : "Chưa đặt"}
              {" – "}
              {profile.budgetMax !== null && profile.budgetMax !== undefined
                ? currency.format(profile.budgetMax)
                : "Chưa đặt"}
            </p>
          </Card>
        )}
        {lifestyle.length > 0 && (
          <Card className="summary-card profile-lifestyle">
            <h2>Nhịp sống</h2>
            <div className="tag-list">
              {lifestyle.map((value) => (
                <span key={value}>{lifestyleLabels[value] || value}</span>
              ))}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
