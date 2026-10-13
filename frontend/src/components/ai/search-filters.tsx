"use client";
import { useState } from "react";
import type { SearchDraft } from "@/lib/ai";
import { amenities, listingTypes } from "@/lib/listings";
import { Button, Checkbox, Input, Select, Textarea } from "../ui";
import { useAi } from "./use-ai";
import { AiPanel } from "./ai-panel";
function SearchReview({
  draft,
  provinces,
  onApply,
}: {
  draft: SearchDraft;
  provinces: { code: string; name: string }[];
  onApply: (filters: SearchDraft["filters"]) => void;
}) {
  const [type, setType] = useState(draft.filters.type ?? "");
  const [provinceCode, setProvince] = useState(
    draft.filters.provinceCode ?? "",
  );
  const [minRent, setMin] = useState(
    draft.filters.minRent === null ? "" : String(draft.filters.minRent),
  );
  const [maxRent, setMax] = useState(
    draft.filters.maxRent === null ? "" : String(draft.filters.maxRent),
  );
  const [selected, setSelected] = useState(draft.filters.amenities);
  const validMoney = (s: string) =>
    !s ||
    (Number.isInteger(Number(s)) && Number(s) >= 0 && Number(s) <= 100000000);
  const valid =
    validMoney(minRent) &&
    validMoney(maxRent) &&
    (!minRent || !maxRent || Number(minRent) <= Number(maxRent));
  return (
    <div className="form-stack">
      <h4>Kiểm tra và chỉnh sửa bộ lọc đề xuất</h4>
      <Select
        id="ai-search-type"
        label="Loại tin"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="">Tất cả loại tin</option>
        {Object.entries(listingTypes).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select
        id="ai-search-province"
        label="Tỉnh / thành phố"
        value={provinceCode}
        onChange={(e) => setProvince(e.target.value)}
      >
        <option value="">Tất cả khu vực</option>
        {provinces.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </Select>
      <div className="form-grid">
        <Input
          id="ai-search-min"
          label="Mức tiền từ / tháng (VNĐ)"
          type="number"
          min={0}
          max={100000000}
          value={minRent}
          onChange={(e) => setMin(e.target.value)}
        />
        <Input
          id="ai-search-max"
          label="Mức tiền đến / tháng (VNĐ)"
          type="number"
          min={0}
          max={100000000}
          value={maxRent}
          onChange={(e) => setMax(e.target.value)}
        />
      </div>
      <fieldset>
        <legend>Tiện ích</legend>
        {Object.entries(amenities).map(([key, label]) => (
          <Checkbox
            key={key}
            label={label}
            checked={selected.includes(key)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, key]
                  : selected.filter((a) => a !== key),
              )
            }
          />
        ))}
      </fieldset>
      {draft.unsupported.length > 0 && (
        <div>
          <p>
            Điều kiện chưa được áp dụng — cần kiểm tra tin hoặc trao đổi thêm:
          </p>
          <ul>
            {draft.unsupported.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        variant="secondary"
        disabled={
          !valid ||
          (!type && !provinceCode && !minRent && !maxRent && !selected.length)
        }
        onClick={() =>
          onApply({
            type: type || null,
            provinceCode: provinceCode || null,
            minRent: minRent ? Number(minRent) : null,
            maxRent: maxRent ? Number(maxRent) : null,
            amenities: selected,
          })
        }
      >
        Áp dụng bộ lọc đã kiểm tra
      </Button>
    </div>
  );
}
export function SearchFiltersAssistant({
  provinces,
  onApply,
}: {
  provinces: { code: string; name: string }[];
  onApply: (filters: SearchDraft["filters"]) => void;
}) {
  const ai = useAi<SearchDraft>();
  const [query, setQuery] = useState("");
  return (
    <AiPanel
      title="Tìm kiếm bằng câu tự nhiên"
      detail="Chuyển nhu cầu của bạn thành loại tin, khu vực, mức tiền và tiện ích có thể lọc."
      {...ai}
    >
      <Textarea
        id="ai-search-query"
        label="Bạn muốn tìm chỗ ở như thế nào?"
        rows={2}
        maxLength={500}
        value={query}
        disabled={ai.pending}
        onChange={(e) => {
          setQuery(e.target.value);
          ai.clear();
        }}
        placeholder="Tìm phòng cho thuê ở Đà Nẵng dưới 3 triệu, có bếp và Wi-Fi"
      />
      <Button
        variant="secondary"
        disabled={ai.pending || query.trim().length < 5}
        onClick={() => void ai.run("search-filters", { query })}
      >
        {ai.pending ? "Đang tạo bộ lọc…" : "Đề xuất bộ lọc"}
      </Button>
      {ai.result && (
        <SearchReview
          key={JSON.stringify(ai.result)}
          draft={ai.result}
          provinces={provinces}
          onApply={onApply}
        />
      )}
    </AiPanel>
  );
}
