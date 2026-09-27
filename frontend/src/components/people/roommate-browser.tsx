"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-provider";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "../ui";
import { apiFetch } from "@/lib/api";
import { formatBudget, peopleError, type PeoplePage } from "@/lib/people";
import { lifestyleLabels, type MyProfile } from "@/lib/profile";
import { PersonAvatar, PersonDetails } from "./person-details";

type Unit = { code: string; name: string };

const habitFilters = [
  {
    name: "sleepSchedule",
    label: "Giờ ngủ",
    options: ["EARLY_BIRD", "FLEXIBLE", "NIGHT_OWL"],
  },
  {
    name: "smokingPreference",
    label: "Hút thuốc",
    options: ["NO_SMOKING", "OUTDOOR_ONLY", "SMOKER"],
  },
  {
    name: "petPreference",
    label: "Thú cưng",
    options: ["NO_PETS", "PET_FRIENDLY", "HAS_PETS"],
  },
  {
    name: "quietLevel",
    label: "Mức độ yên tĩnh",
    options: ["QUIET", "BALANCED", "SOCIAL"],
  },
];

export function RoommateBrowser() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshCount, setRefreshCount] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [notice, setNotice] = useState("");
  const [province, setProvince] = useState("");
  const [ward, setWard] = useState("");
  const [provinces, setProvinces] = useState<Unit[]>([]);
  const [wards, setWards] = useState<Unit[]>([]);
  const [locationError, setLocationError] = useState("");
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<{
    requestKey: string;
    data?: PeoplePage;
    error?: string;
  }>({ requestKey: "" });
  const requestPath = `/people?page=${page}&${query}`;
  const requestKey = `${requestPath}:${refreshCount}:${user?.id ?? ""}`;
  const isCurrentResult = result.requestKey === requestKey;
  const data = isCurrentResult ? result.data : undefined;
  const person = data?.items.find((person) => person.userId === selectedUserId);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<PeoplePage>(requestPath, { signal: controller.signal })
      .then((data) => {
        if (page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
        else setResult({ requestKey, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ requestKey, error: peopleError(error) });
      });
    return () => controller.abort();
  }, [requestPath, requestKey, page]);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Unit[]>("/locations/provinces", { signal: controller.signal })
      .then(setProvinces)
      .catch(() => {
        if (!controller.signal.aborted)
          setLocationError("Không tải được danh mục khu vực.");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!province) return;
    const controller = new AbortController();
    apiFetch<Unit[]>(`/locations/provinces/${province}/wards`, {
      signal: controller.signal,
    })
      .then(setWards)
      .catch(() => {
        if (!controller.signal.aborted)
          setLocationError("Không tải được danh mục phường/xã.");
      });
    return () => controller.abort();
  }, [province]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    apiFetch<MyProfile>("/profiles/me", { signal: controller.signal })
      .then(setMyProfile)
      .catch(() => {});
    return () => controller.abort();
  }, [user]);
  useEffect(() => {
    if (selectedUserId)
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedUserId]);
  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    fields.forEach((value, name) => {
      if (String(value).trim()) params.set(name, String(value).trim());
    });
    setQuery(params.toString());
    setPage(1);
    setSelectedUserId("");
    setRefreshCount((value) => value + 1);
  }
  function handleChange(message: string) {
    setNotice(message);
    setRefreshCount((value) => value + 1);
  }
  return (
    <section className="container page-section people-page">
      <div className="people-page-heading">
        <div>
          <span className="eyebrow">HỢP NGƯỜI, CHUNG NHÀ</span>
          <h1>Tìm người hợp nếp sống.</h1>
          <p className="text-muted">
            Đối chiếu khu vực, ngân sách và thói quen để bắt đầu một lời kết nối
            phù hợp.
          </p>
        </div>
        <ButtonLink href="/ket-noi" variant="secondary">
          Yêu cầu kết nối →
        </ButtonLink>
      </div>
      {user && myProfile?.userId === user.id && (
        <Card className="people-preferences">
          <PersonAvatar person={myProfile} />
          <div>
            <strong>{myProfile.displayName}</strong>
            <p className="text-muted">{formatBudget(myProfile)}</p>
            <p className="text-muted">
              {myProfile.desiredAreas.join(", ") ||
                "Chưa chọn khu vực mong muốn"}
            </p>
          </div>
          <ButtonLink href="/tai-khoan/ho-so" variant="secondary">
            Chỉnh sửa tiêu chí
          </ButtonLink>
        </Card>
      )}
      {!user && (
        <p className="listing-privacy">
          Đăng nhập và bổ sung hồ sơ để xem đối chiếu với nếp sống của bạn.
        </p>
      )}
      <Card className="people-filters">
        <Button
          variant="secondary"
          className="people-filter-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? "Ẩn bộ lọc ↑" : "Mở bộ lọc ↓"}
        </Button>
        <form
          className={
            filtersOpen ? "people-filter-form is-open" : "people-filter-form"
          }
          onSubmit={search}
          onReset={() => {
            setProvince("");
            setWard("");
            setWards([]);
            setQuery("");
            setPage(1);
            setSelectedUserId("");
            setRefreshCount((value) => value + 1);
          }}
        >
          <div className="people-filter-grid">
            <Input
              id="people-q"
              name="q"
              label="Tìm theo tên / giới thiệu"
              maxLength={100}
            />
            <Select
              id="people-province"
              name="provinceCode"
              label="Tỉnh / thành phố"
              value={province}
              onChange={(event) => {
                setProvince(event.target.value);
                setWard("");
                setWards([]);
              }}
            >
              <option value="">Tất cả khu vực</option>
              {provinces.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select
              id="people-ward"
              name="wardCode"
              label="Phường / xã"
              value={ward}
              disabled={!province}
              onChange={(event) => setWard(event.target.value)}
            >
              <option value="">Tất cả phường/xã</option>
              {wards.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Input
              id="people-budget-min"
              name="budgetMin"
              label="Ngân sách tối thiểu / tháng"
              type="number"
              min={0}
              max={100000000}
            />
            <Input
              id="people-budget-max"
              name="budgetMax"
              label="Ngân sách tối đa / tháng"
              type="number"
              min={0}
              max={100000000}
            />
            {habitFilters.map((filter) => (
              <Select
                key={filter.name}
                id={`people-${filter.name}`}
                name={filter.name}
                label={filter.label}
              >
                <option value="">Không giới hạn</option>
                {filter.options.map((value) => (
                  <option key={value} value={value}>
                    {lifestyleLabels[value]}
                  </option>
                ))}
              </Select>
            ))}
          </div>
          <div className="people-action-row">
            <Button type="submit">Tìm người phù hợp</Button>
            <Button type="reset" variant="secondary">
              Xóa bộ lọc
            </Button>
          </div>
        </form>
        {locationError && <ErrorState message={locationError} />}
      </Card>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <div className="people-result-heading">
        <h2>{data ? `${data.total} hồ sơ công khai` : "Tìm người cùng nhà"}</h2>
        <span className="text-muted text-sm">Hồ sơ cập nhật gần đây</span>
        <Button
          variant="secondary"
          onClick={() => setRefreshCount((value) => value + 1)}
        >
          Làm mới
        </Button>
      </div>
      {!isCurrentResult ? (
        <LoadingState />
      ) : result.error ? (
        <ErrorState message={result.error} />
      ) : data?.items.length === 0 ? (
        <EmptyState title="Chưa tìm thấy hồ sơ phù hợp">
          <p>Thử đổi khu vực, ngân sách hoặc giảm bộ lọc thói quen.</p>
        </EmptyState>
      ) : (
        <div className="people-results">
          <div className="people-list">
            {data?.items.map((item) => (
              <Card
                key={item.userId}
                className={`person-card${selectedUserId === item.userId ? " is-selected" : ""}`}
              >
                <div className="person-identity">
                  <PersonAvatar person={item} />
                  <div>
                    <h3>{item.displayName}</h3>
                    <p className="text-muted">{formatBudget(item)}</p>
                    <p className="text-muted">
                      {item.desiredAreas?.join(", ") ||
                        "Khu vực chưa công khai"}
                    </p>
                  </div>
                </div>
                <p className="person-card-bio">
                  {item.bio || "Chưa bổ sung lời giới thiệu."}
                </p>
                <div className="people-tags">
                  {[
                    item.sleepSchedule,
                    item.smokingPreference,
                    item.petPreference,
                    item.quietLevel,
                  ]
                    .filter(Boolean)
                    .map((value) => (
                      <span key={value}>{lifestyleLabels[value!]}</span>
                    ))}
                </div>
                <div className="person-card-footer">
                  <div>
                    <strong>
                      {item.match?.score == null
                        ? "Chưa đủ dữ liệu"
                        : `${item.match.score}% phù hợp`}
                    </strong>
                    <small>
                      {item.match?.assessed ?? 0}/6 tiêu chí đã đối chiếu
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedUserId(item.userId)}
                    aria-label={`Xem hồ sơ ${item.displayName}`}
                  >
                    Xem hồ sơ →
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <div ref={panel} className="people-detail-panel">
            {person ? (
              <PersonDetails
                key={person.userId}
                person={person}
                onChange={handleChange}
              />
            ) : (
              <Card className="people-panel-empty">
                <span aria-hidden="true">♡</span>
                <h3>Một nhịp sống phù hợp</h3>
                <p className="text-muted">
                  Chọn một hồ sơ để xem lý do phù hợp, khác biệt và gửi lời kết
                  nối.
                </p>
                <p className="text-muted text-sm">
                  Thông tin ẩn không được dùng để lọc hoặc tính điểm. Điểm không
                  phải bảo đảm về người cùng nhà.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="people-pagination" aria-label="Phân trang hồ sơ">
          <Button
            variant="secondary"
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
              setSelectedUserId("");
            }}
          >
            ← Trang trước
          </Button>
          <span>
            Trang {page}/{data.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= data.pages}
            onClick={() => {
              setPage(page + 1);
              setSelectedUserId("");
            }}
          >
            Trang sau →
          </Button>
        </nav>
      )}
    </section>
  );
}
