"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { DesiredLocation } from "@/lib/profile";
import { SearchableSelect } from "./searchable-select";
import { ProfileIcon } from "./profile-icon";

type Unit = { code: string; name: string };

export function LocationPicker({
  value,
  legacy,
  disabled,
  onChange,
  onUnadded,
}: {
  value: DesiredLocation[];
  legacy: string[];
  disabled: boolean;
  onChange: (value: DesiredLocation[]) => void;
  onUnadded: (pending: boolean) => void;
}) {
  const [provinces, setProvinces] = useState<Unit[]>([]);
  const [wards, setWards] = useState<Unit[]>([]);
  const [province, setProvince] = useState("");
  const [ward, setWard] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Unit[]>("/locations/provinces", { signal: controller.signal })
      .then(setProvinces)
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Không tải được danh mục. Bạn có thể lưu các mục khác và thử lại.",
          );
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!province) return;
    const controller = new AbortController();
    apiFetch<Unit[]>(`/locations/provinces/${province}/wards`, {
      signal: controller.signal,
    })
      .then(setWards)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Không tải được phường/xã. Vui lòng thử lại.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [province, retry]);

  function add() {
    const selectedProvince = provinces.find((item) => item.code === province);
    const selectedWard = wards.find((item) => item.code === ward);
    if (!selectedProvince || (ward && !selectedWard)) return;
    if (
      value.some(
        (item) =>
          item.provinceCode === province && item.wardCode === (ward || null),
      )
    ) {
      setError("Khu vực này đã có trong danh sách.");
      return;
    }
    onChange([
      ...value,
      {
        provinceCode: province,
        wardCode: ward || null,
        provinceName: selectedProvince.name,
        wardName: selectedWard?.name ?? null,
      },
    ]);
    setProvince("");
    setWard("");
    setWards([]);
    setError("");
    onUnadded(false);
  }

  return (
    <div className="location-picker">
      <div className="form-grid">
        <SearchableSelect
          id="province"
          label="Tỉnh / thành phố"
          value={province}
          placeholder="Chọn tỉnh / thành phố"
          options={provinces}
          disabled={disabled || !provinces.length || value.length >= 5}
          onChange={(code) => {
            setProvince(code);
            setWard("");
            setWards([]);
            setError("");
            setLoading(Boolean(code));
            onUnadded(Boolean(code));
          }}
        />
        <SearchableSelect
          id="ward"
          label="Phường / xã"
          value={ward}
          placeholder={
            loading ? "Đang tải phường / xã…" : "Chọn tỉnh / thành phố trước"
          }
          options={
            province
              ? [{ code: "", name: "Toàn tỉnh / thành phố" }, ...wards]
              : []
          }
          disabled={disabled || !province || loading || !wards.length}
          onChange={setWard}
        />
      </div>
      {province && (
        <div className="location-search-row">
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled || loading || !wards.length || value.length >= 5}
            onClick={add}
          >
            + Thêm khu vực
          </button>
        </div>
      )}
      <p className="text-muted text-sm">
        Chọn phường/xã rồi bấm Thêm khu vực. Tối đa 5 nơi; có thể chọn cả
        tỉnh/thành phố.
      </p>
      {value.length > 0 && (
        <ul className="selected-locations" aria-label="Khu vực đã chọn">
          {value.map((item, index) => (
            <li key={`${item.provinceCode}:${item.wardCode}`}>
              <ProfileIcon name="pin" width={16} height={16} />
              <span>
                {item.wardName ? `${item.wardName}, ` : ""}
                {item.provinceName}
              </span>
              <button
                type="button"
                aria-label={`Xóa ${item.wardName ?? item.provinceName}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {!value.length && legacy.length > 0 && (
        <div className="legacy-locations">
          <p>Khu vực đã lưu: {legacy.join(" · ")}</p>
          <p>Chọn địa chỉ mới sẽ thay thế các tên khu vực cũ.</p>
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Xóa khu vực cũ
          </button>
        </div>
      )}
      {error && (
        <div className="location-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => {
              setError("");
              setLoading(Boolean(province));
              setRetry((count) => count + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
