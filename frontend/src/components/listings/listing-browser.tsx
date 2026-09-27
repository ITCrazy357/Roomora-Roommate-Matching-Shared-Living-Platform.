"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth-provider";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "../ui";
import { apiFetch } from "@/lib/api";
import {
  amenities,
  ListingPage,
  listingError,
  listingStatuses,
} from "@/lib/listings";
import { ListingCard } from "./listing-card";

type Unit = { code: string; name: string };

export function ListingBrowser({
  mode = "explore",
}: {
  mode?: "explore" | "mine" | "saved";
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [province, setProvince] = useState("");
  const [provinces, setProvinces] = useState<Unit[]>([]);
  const [wards, setWards] = useState<Unit[]>([]);
  const [locationError, setLocationError] = useState("");
  const [result, setResult] = useState<{
    key: string;
    data?: ListingPage;
    error?: string;
  }>({ key: "" });
  const path =
    mode === "mine"
      ? "/listings/mine"
      : mode === "saved"
        ? "/listings/saved"
        : "/listings";
  const requestPath = `${path}?page=${page}&${query}`;
  const requestKey = `${requestPath}:${retry}:${user?.id ?? ""}`;
  const ready = result.key === requestKey;

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ListingPage>(requestPath, { signal: controller.signal })
      .then((data) => {
        if (page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
        else setResult({ key: requestKey, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, error: listingError(error) });
      });
    return () => controller.abort();
  }, [requestPath, requestKey, page]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Unit[]>("/locations/provinces", { signal: controller.signal })
      .then(setProvinces)
      .catch(() => {
        if (!controller.signal.aborted)
          setLocationError(
            "Không tải được danh mục khu vực. Vui lòng tải lại trang.",
          );
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
          setLocationError("Không tải được phường/xã. Vui lòng tải lại trang.");
      });
    return () => controller.abort();
  }, [province]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of [
      "search",
      "provinceCode",
      "wardCode",
      "minRent",
      "maxRent",
      "sort",
      "status",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    const selected = form.getAll("amenities").map(String);
    if (selected.length) params.set("amenities", selected.join(","));
    setPage(1);
    setQuery(params.toString());
    setRetry((value) => value + 1);
  }

  const titles = {
    explore: "Tìm một nơi ở, gặp người hợp mình.",
    mine: "Tin đăng của tôi",
    saved: "Những căn phòng bạn đã lưu",
  };
  return (
    <section className="container page-section listings-page">
      <div className="listing-page-heading">
        <div>
          <span className="eyebrow">
            {mode === "explore" ? "KHÁM PHÁ ROOMORA" : "KHÔNG GIAN CỦA BẠN"}
          </span>
          <h1>{titles[mode]}</h1>
          <p className="text-muted">
            {mode === "explore"
              ? "Khám phá phòng có chỗ trống, chi phí rõ ràng và nếp sống phù hợp."
              : mode === "mine"
                ? "Tiếp tục bản nháp, theo dõi kiểm duyệt và quản lý tin phòng của bạn."
                : "Các tin đang công khai bạn quan tâm. Tin tạm ẩn sẽ hiển thị lại khi được duyệt."}
          </p>
        </div>
        <ButtonLink href="/dang-tin">+ Đăng tin mới</ButtonLink>
      </div>
      <form onSubmit={search} className="listing-search-form">
        <div className="listing-search-bar">
          <Input
            id="search"
            label="Tìm kiếm phòng"
            name="search"
            placeholder="Tên phòng hoặc khu vực…"
            maxLength={150}
          />
          <Select id="sort" name="sort" label="Sắp xếp">
            <option value="newest">
              {mode === "mine" ? "Mới cập nhật" : "Mới nhất"}
            </option>
            <option value="price_asc">Giá tăng dần</option>
            <option value="price_desc">Giá giảm dần</option>
          </Select>
          <Button type="submit">Tìm phòng</Button>
        </div>
        <div
          className={`listing-browser-grid ${mode !== "explore" ? "listing-browser-personal" : ""}`}
        >
          <div
            className={`listing-filter-panel ${filtersOpen ? "filters-open" : ""}`}
          >
            <Button
              className="listing-filter-toggle"
              variant="secondary"
              aria-expanded={filtersOpen}
              aria-controls="listing-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              {filtersOpen ? "Ẩn bộ lọc ↑" : "Mở bộ lọc ↓"}
            </Button>
            <aside id="listing-filters" className="listing-filters card">
              <div className="listing-filter-heading">
                <h2>Bộ lọc</h2>
                <button
                  type="reset"
                  className="text-link"
                  onClick={() => {
                    setProvince("");
                    setWards([]);
                    setQuery("");
                    setPage(1);
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
              <Select
                id="provinceCode"
                label="Tỉnh / thành phố"
                name="provinceCode"
                value={province}
                onChange={(event) => {
                  setProvince(event.target.value);
                  setWards([]);
                  setLocationError("");
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
                key={province}
                id="wardCode"
                name="wardCode"
                label="Phường / xã"
                disabled={!province || !wards.length}
              >
                <option value="">Tất cả phường / xã</option>
                {wards.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </Select>
              {locationError && (
                <p className="text-danger" role="alert">
                  {locationError}
                </p>
              )}
              <Input
                id="minRent"
                name="minRent"
                label="Giá tối thiểu / người / tháng"
                type="number"
                min={0}
                max={100000000}
                step={1}
                placeholder="VNĐ"
              />
              <Input
                id="maxRent"
                name="maxRent"
                label="Giá tối đa / người / tháng"
                type="number"
                min={0}
                max={100000000}
                step={1}
                placeholder="VNĐ"
              />
              {mode === "mine" && (
                <Select id="status" name="status" label="Trạng thái">
                  <option value="">Tất cả trạng thái</option>
                  {Object.entries(listingStatuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
              <fieldset className="listing-checkboxes">
                <legend>Tiện ích</legend>
                {Object.entries(amenities).map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" name="amenities" value={key} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <Button type="submit">Áp dụng bộ lọc</Button>
            </aside>
          </div>
          <div
            className="listing-results"
            aria-live="polite"
            aria-busy={!ready}
          >
            {!ready ? (
              <LoadingState message="Đang tìm phòng…" />
            ) : result.error ? (
              <ErrorState
                message={result.error}
                action={
                  <Button onClick={() => setRetry((value) => value + 1)}>
                    Thử lại
                  </Button>
                }
              />
            ) : (
              result.data && (
                <>
                  <div className="listing-results-heading">
                    <h2>
                      {result.data.total}{" "}
                      {mode === "mine" ? "tin đăng" : "phòng phù hợp"}
                    </h2>
                    <span className="text-muted">
                      Trang {page}
                      {result.data.pages ? ` / ${result.data.pages}` : ""}
                    </span>
                  </div>
                  {result.data.items.length ? (
                    <div
                      className={
                        mode === "mine" ? "listing-rows" : "listing-grid"
                      }
                      key={requestKey}
                    >
                      {result.data.items.map((listing) => (
                        <ListingCard
                          key={listing.id}
                          listing={listing}
                          manage={mode === "mine"}
                          onSave={
                            mode === "saved"
                              ? () => setRetry((value) => value + 1)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title={
                        mode === "mine"
                          ? "Bắt đầu với căn phòng của bạn"
                          : "Chưa có phòng phù hợp"
                      }
                      action={
                        <ButtonLink
                          href={mode === "mine" ? "/dang-tin" : "/tim-phong"}
                        >
                          {mode === "mine"
                            ? "Tạo tin đầu tiên"
                            : "Khám phá phòng"}
                        </ButtonLink>
                      }
                    >
                      <p>
                        {mode === "saved"
                          ? "Lưu tin từ trang khám phá để xem lại tại đây."
                          : "Thử thay đổi bộ lọc hoặc quay lại sau khi có tin mới."}
                      </p>
                    </EmptyState>
                  )}
                  {result.data.pages > 1 && (
                    <nav className="listing-pagination" aria-label="Phân trang">
                      <Button
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        ← Trang trước
                      </Button>
                      <span>
                        {page} / {result.data.pages}
                      </span>
                      <Button
                        variant="secondary"
                        disabled={page >= result.data.pages}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Trang sau →
                      </Button>
                    </nav>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
