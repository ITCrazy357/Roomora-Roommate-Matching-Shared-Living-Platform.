"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import {
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Textarea,
} from "./ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import type { MyProfile } from "@/lib/profile";

function optionalNumber(value: FormDataEntryValue | null) {
  return value === null || value === "" ? null : Number(value);
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function ProfileEditor({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const router = useRouter();
  const auth = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
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
    apiFetch<MyProfile>("/profiles/me")
      .then(setProfile)
      .catch((fetchError) => setError(authErrorMessage(fetchError)))
      .finally(() => setLoading(false));
  }, [auth.loading, auth.user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSaved(false);
    const data = new FormData(event.currentTarget);
    const desiredAreas = String(data.get("desiredAreas") ?? "")
      .split(",")
      .map((area) => area.trim())
      .filter(Boolean);
    try {
      const updated = await apiFetch<MyProfile>("/profiles/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          avatarUrl: optionalText(data.get("avatarUrl")),
          bio: optionalText(data.get("bio")),
          budgetMin: optionalNumber(data.get("budgetMin")),
          budgetMax: optionalNumber(data.get("budgetMax")),
          desiredAreas,
          sleepSchedule: optionalText(data.get("sleepSchedule")),
          smokingPreference: optionalText(data.get("smokingPreference")),
          petPreference: optionalText(data.get("petPreference")),
          quietLevel: optionalText(data.get("quietLevel")),
          completeOnboarding: onboarding || undefined,
        }),
      });
      setProfile((current) => ({ ...current!, ...updated }));
      await auth.refresh();
      if (onboarding) {
        router.replace("/tai-khoan/ho-so");
        router.refresh();
      } else {
        setSaved(true);
      }
    } catch (submitError) {
      setError(authErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  if (loading || auth.loading)
    return <LoadingState message="Đang tải hồ sơ…" />;
  if (!profile) return <ErrorState message={error || "Không thể tải hồ sơ."} />;

  return (
    <form className="profile-layout" onSubmit={submit}>
      <Card className="profile-section">
        <div className="section-copy">
          <span className="eyebrow">THÔNG TIN CƠ BẢN</span>
          <h2>Giới thiệu bạn với cộng đồng</h2>
          <p className="text-muted">
            Email là dữ liệu riêng tư và không xuất hiện trong hồ sơ công khai.
          </p>
        </div>
        <div className="form-stack">
          <Input
            id="displayName"
            name="displayName"
            label="Tên hiển thị"
            defaultValue={profile.displayName}
            minLength={2}
            maxLength={80}
            required
          />
          <Input
            id="avatarUrl"
            name="avatarUrl"
            label="Đường dẫn ảnh đại diện"
            type="url"
            defaultValue={profile.avatarUrl ?? ""}
            placeholder="https://..."
            hint="Dùng URL ảnh HTTPS. Lưu trữ ảnh trực tiếp sẽ được nối với kho đối tượng ở phase tin đăng."
          />
          <Textarea
            id="bio"
            name="bio"
            label="Giới thiệu ngắn"
            defaultValue={profile.bio ?? ""}
            maxLength={500}
            rows={5}
          />
        </div>
      </Card>

      <Card className="profile-section">
        <div className="section-copy">
          <span className="eyebrow">NHU CẦU Ở</span>
          <h2>Ngân sách và khu vực</h2>
          <p className="text-muted">Các số tiền dùng đơn vị đồng mỗi tháng.</p>
        </div>
        <div className="form-stack">
          <div className="form-grid">
            <Input
              id="budgetMin"
              name="budgetMin"
              label="Ngân sách từ"
              type="number"
              min={0}
              max={100000000}
              step={100000}
              defaultValue={profile.budgetMin ?? ""}
            />
            <Input
              id="budgetMax"
              name="budgetMax"
              label="Ngân sách đến"
              type="number"
              min={0}
              max={100000000}
              step={100000}
              defaultValue={profile.budgetMax ?? ""}
            />
          </div>
          <Input
            id="desiredAreas"
            name="desiredAreas"
            label="Khu vực mong muốn"
            defaultValue={profile.desiredAreas.join(", ")}
            hint="Tối đa 5 khu vực, ngăn cách bằng dấu phẩy."
          />
        </div>
      </Card>

      <Card className="profile-section">
        <div className="section-copy">
          <span className="eyebrow">NHỊP SỐNG</span>
          <h2>Thói quen ở chung</h2>
          <p className="text-muted">Bạn có thể để trống và bổ sung sau.</p>
        </div>
        <div className="form-grid">
          <Select
            id="sleepSchedule"
            name="sleepSchedule"
            label="Giờ giấc"
            defaultValue={profile.sleepSchedule ?? ""}
          >
            <option value="">Chưa chia sẻ</option>
            <option value="EARLY_BIRD">Ngủ và dậy sớm</option>
            <option value="FLEXIBLE">Linh hoạt</option>
            <option value="NIGHT_OWL">Thường thức khuya</option>
          </Select>
          <Select
            id="smokingPreference"
            name="smokingPreference"
            label="Hút thuốc"
            defaultValue={profile.smokingPreference ?? ""}
          >
            <option value="">Chưa chia sẻ</option>
            <option value="NO_SMOKING">Không hút thuốc</option>
            <option value="OUTDOOR_ONLY">Chỉ hút ngoài nhà</option>
            <option value="SMOKER">Có hút thuốc</option>
          </Select>
          <Select
            id="petPreference"
            name="petPreference"
            label="Thú cưng"
            defaultValue={profile.petPreference ?? ""}
          >
            <option value="">Chưa chia sẻ</option>
            <option value="NO_PETS">Không nuôi thú cưng</option>
            <option value="PET_FRIENDLY">Thoải mái với thú cưng</option>
            <option value="HAS_PETS">Đang nuôi thú cưng</option>
          </Select>
          <Select
            id="quietLevel"
            name="quietLevel"
            label="Không khí trong nhà"
            defaultValue={profile.quietLevel ?? ""}
          >
            <option value="">Chưa chia sẻ</option>
            <option value="QUIET">Ưu tiên yên tĩnh</option>
            <option value="BALANCED">Cân bằng</option>
            <option value="SOCIAL">Thích giao lưu</option>
          </Select>
        </div>
      </Card>

      {error && <div className="error-state">{error}</div>}
      {saved && <div className="success-state">Hồ sơ đã được cập nhật.</div>}
      <div className="form-actions">
        {!onboarding && profile.userId && (
          <Link className="text-link" href={`/ho-so/${profile.userId}`}>
            Xem hồ sơ công khai
          </Link>
        )}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Đang lưu…"
            : onboarding
              ? "Hoàn tất onboarding"
              : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}
