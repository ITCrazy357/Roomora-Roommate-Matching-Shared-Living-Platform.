"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { AvatarUpload } from "./avatar-upload";
import { LocationPicker } from "./location-picker";
import { ProfileIcon } from "./profile-icon";
import { Button, ErrorState, Input, LoadingState, Textarea } from "./ui";
import { apiFetch } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";
import type { DesiredLocation, MyProfile } from "@/lib/profile";

const steps = [
  {
    label: "Bản thân",
    icon: "person" as const,
    title: "Chào bạn. Kể một chút về mình nhé.",
    description:
      "Một bức ảnh, vài dòng giới thiệu. Bắt đầu từ những điều thật nhất về bạn.",
  },
  {
    label: "Chỗ ở",
    icon: "home" as const,
    title: "Nơi nào khiến bạn muốn trở về?",
    description:
      "Chọn khoảng chi tiêu thoải mái và những khu vực bạn muốn tìm một nơi ở mới.",
  },
  {
    label: "Nếp sống",
    icon: "sun" as const,
    title: "Cùng nhà, hợp cả nhịp sống.",
    description:
      "Không cần giống nhau mọi thứ. Biết trước những thói quen sẽ giúp việc ở chung dễ dàng hơn.",
  },
];
const budgets = [
  { label: "Dưới 2 triệu", min: 0, max: 2_000_000 },
  { label: "2 – 3,5 triệu", min: 2_000_000, max: 3_500_000 },
  { label: "3,5 – 5 triệu", min: 3_500_000, max: 5_000_000 },
  { label: "5 – 7 triệu", min: 5_000_000, max: 7_000_000 },
  { label: "7 – 10 triệu", min: 7_000_000, max: 10_000_000 },
  { label: "Trên 10 triệu", min: 10_000_000, max: null },
];
const habits = [
  {
    key: "sleepSchedule",
    label: "Giờ giấc",
    description: "Bạn thường bắt đầu và kết thúc ngày thế nào?",
    options: [
      ["EARLY_BIRD", "Ngủ và dậy sớm"],
      ["FLEXIBLE", "Linh hoạt"],
      ["NIGHT_OWL", "Thường thức khuya"],
    ],
  },
  {
    key: "smokingPreference",
    label: "Hút thuốc",
    description: "Một điều nên nói rõ ngay từ đầu.",
    options: [
      ["NO_SMOKING", "Không hút thuốc"],
      ["OUTDOOR_ONLY", "Chỉ hút ngoài nhà"],
      ["SMOKER", "Có hút thuốc"],
    ],
  },
  {
    key: "petPreference",
    label: "Thú cưng",
    description: "Có chỗ cho một người bạn bốn chân không?",
    options: [
      ["NO_PETS", "Không nuôi thú cưng"],
      ["PET_FRIENDLY", "Thoải mái với thú cưng"],
      ["HAS_PETS", "Đang nuôi thú cưng"],
    ],
  },
  {
    key: "quietLevel",
    label: "Không khí trong nhà",
    description: "Một ngôi nhà hợp với nhịp sống của bạn.",
    options: [
      ["QUIET", "Ưu tiên yên tĩnh"],
      ["BALANCED", "Cân bằng"],
      ["SOCIAL", "Thích giao lưu"],
    ],
  },
] as const;

type Draft = Pick<
  MyProfile,
  | "displayName"
  | "bio"
  | "budgetMin"
  | "budgetMax"
  | "desiredLocations"
  | "sleepSchedule"
  | "smokingPreference"
  | "petPreference"
  | "quietLevel"
>;
function budgetText(draft: Draft) {
  const money = (n: number) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
      n / 1_000_000,
    );
  if (draft.budgetMin === null && draft.budgetMax === null)
    return "Chưa chọn ngân sách";
  if (draft.budgetMin === null || draft.budgetMin === 0)
    return `Đến ${money(draft.budgetMax ?? 0)} triệu / tháng`;
  if (draft.budgetMax === null)
    return `Từ ${money(draft.budgetMin)} triệu / tháng`;
  return `${money(draft.budgetMin)} – ${money(draft.budgetMax)} triệu / tháng`;
}

export function ProfileEditor({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const router = useRouter();
  const auth = useAuth();
  const userId = auth.user?.id;
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [locationsChanged, setLocationsChanged] = useState(false);
  const [unaddedLocation, setUnaddedLocation] = useState(false);
  const [customBudget, setCustomBudget] = useState(false);

  useEffect(() => {
    if (auth.loading) return;
    if (!userId) {
      router.replace("/dang-nhap");
      return;
    }
    const controller = new AbortController();
    apiFetch<MyProfile>("/profiles/me", { signal: controller.signal })
      .then((data) => {
        setProfile(data);
        setDraft({ ...data, desiredLocations: data.desiredLocations ?? [] });
        setCustomBudget(
          !budgets.some(
            (budget) =>
              budget.min === data.budgetMin && budget.max === data.budgetMax,
          ) &&
            (data.budgetMin !== null || data.budgetMax !== null),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(authErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.loading, userId, router]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  function navigate(next: number) {
    if (unaddedLocation) {
      setError(
        "Bạn còn khu vực chưa thêm. Bấm Thêm khu vực hoặc bỏ chọn tỉnh/thành phố trước khi chuyển bước.",
      );
      return;
    }
    setError("");
    setStep(next);
  }

  async function save(exit = false) {
    if (!draft || pending || uploading) return;
    setError("");
    setSaved(false);
    if (unaddedLocation) {
      setError(
        "Bạn còn khu vực chưa thêm. Bấm Thêm khu vực hoặc bỏ chọn tỉnh/thành phố trước khi lưu.",
      );
      return;
    }
    if (draft.displayName.trim().length < 2) {
      setError("Tên hiển thị cần ít nhất 2 ký tự.");
      setStep(0);
      return;
    }
    if (
      draft.budgetMin !== null &&
      draft.budgetMax !== null &&
      draft.budgetMin > draft.budgetMax
    ) {
      setError("Ngân sách từ không được lớn hơn ngân sách đến.");
      setStep(1);
      return;
    }
    setPending(true);
    try {
      const complete = onboarding && !exit && step === 2;
      const updated = await apiFetch<MyProfile>("/profiles/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: draft.displayName.trim(),
          bio: draft.bio?.trim() || null,
          budgetMin: draft.budgetMin,
          budgetMax: draft.budgetMax,
          ...(locationsChanged
            ? {
                desiredLocations: draft.desiredLocations.map(
                  ({ provinceCode, wardCode }) => ({ provinceCode, wardCode }),
                ),
              }
            : {}),
          sleepSchedule: draft.sleepSchedule,
          smokingPreference: draft.smokingPreference,
          petPreference: draft.petPreference,
          quietLevel: draft.quietLevel,
          ...(complete ? { completeOnboarding: true } : {}),
        }),
      });
      setProfile((current) => ({ ...current!, ...updated }));
      if (exit || complete) {
        await auth.refresh();
        router.replace("/tai-khoan/ho-so");
        router.refresh();
      } else if (onboarding) {
        setStep((step) => step + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setSaved(true);
        await auth.refresh();
      }
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }
  if (loading || auth.loading)
    return <LoadingState message="Đang mở hồ sơ của bạn…" />;
  if (!profile || !draft)
    return (
      <ErrorState
        message={error || "Không thể tải hồ sơ."}
        action={
          <Button onClick={() => window.location.reload()}>Thử lại</Button>
        }
      />
    );
  const disabled = pending || uploading;
  const activeStep = steps[step];
  const locations = draft.desiredLocations;
  const initials =
    draft.displayName.trim().charAt(0).toLocaleUpperCase("vi") || "R";

  return (
    <>
      {onboarding && (
        <header className="setup-heading">
          <div>
            <span className="eyebrow">LÀM QUEN VỚI ROOMORA</span>
            <h1>
              Một hồ sơ nhỏ.
              <br />
              Một khởi đầu mới.
            </h1>
            <p>Chỉ mất vài phút. Bạn luôn có thể thay đổi sau.</p>
          </div>
          <span className="setup-heading-note">
            Hợp người,
            <br />
            <strong>chung nhà.</strong>
          </span>
        </header>
      )}
      <div className="profile-editor-shell">
        <aside className="profile-companion">
          <div className="companion-photo">
            <Image
              src="/images/roomora-home.png"
              alt="Góc phòng ngập nắng với cây xanh và ban công"
              fill
              sizes="(max-width: 767px) 100vw, 340px"
            />
            <span className="companion-caption">MỘT CHỐN ĐỂ VỀ</span>
          </div>
          <div className="companion-copy">
            <span className="eyebrow">HỒ SƠ CỦA BẠN</span>
            <div className="companion-person">
              <div className="companion-avatar">
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt=""
                    width={54}
                    height={54}
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  initials
                )}
              </div>
              <div>
                <h2>{draft.displayName || "Bạn cùng nhà mới"}</h2>
                <p>Đang viết câu chuyện của mình</p>
              </div>
            </div>
            <div className="companion-detail">
              <ProfileIcon name="home" />
              <span>{budgetText(draft)}</span>
            </div>
            <div className="companion-detail">
              <ProfileIcon name="pin" />
              <span>
                {locations.length
                  ? locations
                      .map(
                        (location) =>
                          location.wardName ?? location.provinceName,
                      )
                      .join(" · ")
                  : (locationsChanged
                      ? ""
                      : profile.desiredAreas.join(" · ")) ||
                    "Chưa chọn khu vực"}
              </span>
            </div>
          </div>
          <div className="companion-note">
            <ProfileIcon name="shield" />
            <p>
              Email luôn được giữ riêng tư. Bạn chọn những điều muốn chia sẻ
              trong <Link href="/tai-khoan/cai-dat">cài đặt</Link>.
            </p>
          </div>
        </aside>
        <div className="profile-editor-main">
          {onboarding && (
            <nav
              className="setup-progress"
              aria-label="Các bước hoàn thiện hồ sơ"
            >
              <ol>
                {steps.map((item, index) => (
                  <li
                    key={item.label}
                    className={
                      index === step ? "current" : index < step ? "done" : ""
                    }
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      aria-current={index === step ? "step" : undefined}
                      onClick={() => navigate(index)}
                    >
                      <span className="step-number">
                        {index < step ? (
                          <ProfileIcon name="check" width={16} height={16} />
                        ) : (
                          `0${index + 1}`
                        )}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <form onSubmit={submit} className="profile-edit-form">
            <fieldset disabled={disabled} className="profile-edit-fields">
              {onboarding && (
                <div className="setup-step-heading">
                  <span className="step-eyebrow">BƯỚC 0{step + 1} / 03</span>
                  <h2>{activeStep.title}</h2>
                  <p>{activeStep.description}</p>
                </div>
              )}
              {(!onboarding || step === 0) && (
                <section
                  className="editor-section"
                  aria-labelledby="basic-heading"
                >
                  {!onboarding && (
                    <div className="editor-section-heading">
                      <span className="section-icon">
                        <ProfileIcon name="person" />
                      </span>
                      <div>
                        <h2 id="basic-heading">Một chút về bạn</h2>
                        <p>Giới thiệu bản thân theo cách của riêng mình.</p>
                      </div>
                    </div>
                  )}
                  <AvatarUpload
                    profile={profile}
                    disabled={pending}
                    onBusy={setUploading}
                    onUpdated={(updated) => {
                      setProfile(updated);
                      void auth.refresh();
                    }}
                  />
                  <Input
                    id="displayName"
                    label="Tên hiển thị"
                    value={draft.displayName}
                    onChange={(event) =>
                      change("displayName", event.target.value)
                    }
                    minLength={2}
                    maxLength={80}
                    required
                    autoComplete="nickname"
                  />
                  <Textarea
                    id="bio"
                    label="Giới thiệu ngắn"
                    value={draft.bio ?? ""}
                    onChange={(event) => change("bio", event.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="Mình thích nhà gọn gàng, cuối tuần nấu ăn và thỉnh thoảng có bạn ghé chơi…"
                    hint="Bạn thích gì, sống như thế nào, mong đợi gì ở một người bạn cùng nhà?"
                  />
                  <span className="bio-count">
                    {draft.bio?.length ?? 0}/500
                  </span>
                </section>
              )}
              {(!onboarding || step === 1) && (
                <section
                  className="editor-section"
                  aria-labelledby="housing-heading"
                >
                  {!onboarding && (
                    <div className="editor-section-heading">
                      <span className="section-icon peach">
                        <ProfileIcon name="home" />
                      </span>
                      <div>
                        <h2 id="housing-heading">Chỗ ở bạn mong muốn</h2>
                        <p>
                          Trong khoảng chi tiêu dễ chịu, tại nơi bạn yêu thích.
                        </p>
                      </div>
                    </div>
                  )}
                  <fieldset className="choice-field">
                    <legend>
                      Ngân sách mỗi tháng <span>/ người</span>
                    </legend>
                    <p className="field-note">
                      Khoảng tiền thuê phòng dự kiến, chưa gồm điện nước.
                    </p>
                    <div className="budget-options">
                      {budgets.map((budget) => (
                        <label key={budget.label} className="budget-option">
                          <input
                            type="radio"
                            name="budgetPreset"
                            checked={
                              !customBudget &&
                              draft.budgetMin === budget.min &&
                              draft.budgetMax === budget.max
                            }
                            onChange={() => {
                              setCustomBudget(false);
                              change("budgetMin", budget.min);
                              change("budgetMax", budget.max);
                            }}
                          />
                          <span>{budget.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="budget-extra">
                      <label>
                        <input
                          type="radio"
                          name="budgetPreset"
                          checked={customBudget}
                          onChange={() => setCustomBudget(true)}
                        />{" "}
                        Tự chọn khoảng giá
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="budgetPreset"
                          checked={
                            !customBudget &&
                            draft.budgetMin === null &&
                            draft.budgetMax === null
                          }
                          onChange={() => {
                            setCustomBudget(false);
                            change("budgetMin", null);
                            change("budgetMax", null);
                          }}
                        />{" "}
                        Chưa quyết định
                      </label>
                    </div>
                    {customBudget && (
                      <div className="form-grid custom-budget">
                        <Input
                          id="budgetMin"
                          label="Ngân sách từ (đồng)"
                          type="number"
                          min={0}
                          max={100000000}
                          step={1}
                          value={draft.budgetMin ?? ""}
                          onChange={(event) =>
                            change(
                              "budgetMin",
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                            )
                          }
                        />
                        <Input
                          id="budgetMax"
                          label="Ngân sách đến (đồng)"
                          type="number"
                          min={0}
                          max={100000000}
                          step={1}
                          value={draft.budgetMax ?? ""}
                          onChange={(event) =>
                            change(
                              "budgetMax",
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                            )
                          }
                        />
                      </div>
                    )}
                  </fieldset>
                  <div className="housing-location-heading">
                    <h3>Khu vực mong muốn</h3>
                    <p>
                      Địa giới hai cấp sau sáp nhập · không sử dụng quận/huyện
                      cũ.
                    </p>
                  </div>
                  <LocationPicker
                    value={locations}
                    legacy={locationsChanged ? [] : profile.desiredAreas}
                    disabled={disabled}
                    onUnadded={setUnaddedLocation}
                    onChange={(value: DesiredLocation[]) => {
                      change("desiredLocations", value);
                      setLocationsChanged(true);
                    }}
                  />
                </section>
              )}
              {(!onboarding || step === 2) && (
                <section
                  className="editor-section"
                  aria-labelledby="habits-heading"
                >
                  {!onboarding && (
                    <div className="editor-section-heading">
                      <span className="section-icon">
                        <ProfileIcon name="sun" />
                      </span>
                      <div>
                        <h2 id="habits-heading">Nhịp sống của bạn</h2>
                        <p>Những điều nhỏ, nhưng quan trọng khi chung nhà.</p>
                      </div>
                    </div>
                  )}
                  <div className="habit-fields">
                    {habits.map((habit) => (
                      <fieldset key={habit.key} className="choice-field">
                        <legend>{habit.label}</legend>
                        <p className="field-note">{habit.description}</p>
                        <div className="habit-options">
                          {habit.options.map(([value, label]) => (
                            <label key={value} className="habit-option">
                              <input
                                type="radio"
                                name={habit.key}
                                checked={draft[habit.key] === value}
                                onChange={() => change(habit.key, value)}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                          <label className="habit-option quiet-option">
                            <input
                              type="radio"
                              name={habit.key}
                              checked={draft[habit.key] === null}
                              onChange={() => change(habit.key, null)}
                            />
                            <span>Chưa chia sẻ</span>
                          </label>
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  {onboarding && (
                    <div className="setup-reassurance">
                      <ProfileIcon name="shield" />
                      <p>
                        Không có câu trả lời đúng hay sai. Bạn có thể để trống
                        và bổ sung khi thấy thoải mái.
                      </p>
                    </div>
                  )}
                </section>
              )}
            </fieldset>
            <div className="editor-feedback" aria-live="polite">
              {error && (
                <div className="error-state" role="alert">
                  {error}
                </div>
              )}
              {saved && (
                <div className="success-state" role="status">
                  Hồ sơ đã được cập nhật.
                </div>
              )}
            </div>
            <footer className="editor-actions">
              {onboarding ? (
                <div className="editor-back-actions">
                  {step > 0 && (
                    <button
                      type="button"
                      className="text-link"
                      disabled={disabled}
                      onClick={() => navigate(step - 1)}
                    >
                      ← Quay lại
                    </button>
                  )}
                  <button
                    type="button"
                    className="save-later"
                    disabled={disabled}
                    onClick={() => void save(true)}
                  >
                    Lưu & làm tiếp sau
                  </button>
                </div>
              ) : (
                <Link className="text-link" href={`/ho-so/${profile.userId}`}>
                  Xem hồ sơ công khai
                </Link>
              )}
              <Button type="submit" disabled={disabled}>
                {pending
                  ? "Đang lưu…"
                  : uploading
                    ? "Đang tải ảnh…"
                    : onboarding
                      ? step === 2
                        ? "Hoàn tất hồ sơ"
                        : "Tiếp tục"
                      : "Lưu thay đổi"}
                <ProfileIcon
                  name={onboarding && step === 2 ? "check" : "arrow"}
                  width={18}
                  height={18}
                />
              </Button>
            </footer>
          </form>
        </div>
      </div>
    </>
  );
}
