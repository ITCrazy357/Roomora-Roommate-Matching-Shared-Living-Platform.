"use client";
import Image from "next/image";
import { Button, Input, Select, Textarea } from "../ui";
import {
  amenities,
  listingTypes,
  type Amenity,
  type Listing,
} from "@/lib/listings";
import type { ListingForm, LocationUnit } from "@/lib/listing-form";
import { ListingContent } from "./listing-content";
import { RoomMap } from "./room-map";

interface Props {
  step: number;
  form: ListingForm;
  change: <Key extends keyof ListingForm>(
    key: Key,
    value: ListingForm[Key],
  ) => void;
  listing: Listing | null;
  preview: Listing | null;
  provinces: LocationUnit[];
  wards: LocationUnit[];
  setWards: (wards: LocationUnit[]) => void;
  locationError: string;
  pending: boolean;
  locate: () => void;
  selectLocation: (latitude: number, longitude: number) => void;
  upload: (files: FileList | null) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
}

export function ListingEditorFields({
  step,
  form,
  change,
  listing,
  preview,
  provinces,
  wards,
  setWards,
  locationError,
  pending,
  locate,
  selectLocation,
  upload,
  removePhoto,
}: Props) {
  const numberField = (
    key:
      | "rent"
      | "deposit"
      | "electricityCost"
      | "waterCost"
      | "internetCost"
      | "otherCost"
      | "area"
      | "availableSlots"
      | "currentResidents",
    label: string,
    min = 0,
    max = 100000000,
  ) => (
    <Input
      key={key}
      id={key}
      label={label}
      type="number"
      min={min}
      max={max}
      step={1}
      value={form[key]}
      onChange={(event) => change(key, event.target.value)}
    />
  );

  if (step === 0)
    return (
      <div className="listing-step-intro">
        <span className="badge">BƯỚC 1 / 5</span>
        <h2>Bạn muốn đăng loại tin nào?</h2>
        <p className="text-muted">
          Chọn đúng nhu cầu để tin xuất hiện trong khu vực phù hợp.
        </p>
        <div className="listing-type-options">
          {(
            Object.entries(listingTypes) as [ListingForm["type"], string][]
          ).map(([type, label]) => (
            <label className="listing-type-card" key={type}>
              <input
                type="radio"
                name="listingType"
                value={type}
                checked={form.type === type}
                onChange={() => change("type", type)}
              />
              <strong>{label}</strong>
              <span>
                {type === "ROOMMATE"
                  ? "Bạn có chỗ ở và muốn tìm thêm người cùng nhà."
                  : type === "ROOM_WANTED"
                    ? "Bạn đang tìm phòng trong khu vực và ngân sách mong muốn."
                    : "Bạn có phòng để cho thuê."}
              </span>
            </label>
          ))}
        </div>
        <p className="listing-privacy">
          Tin đăng cần được admin duyệt trước khi xuất hiện ở trang khám phá.
          Dùng ảnh thực tế và thông tin trung thực.
        </p>
      </div>
    );

  if (step === 1)
    return (
      <div className="form-stack">
        <h2>
          {form.type === "ROOM_WANTED"
            ? "Mô tả phòng bạn muốn tìm"
            : "Kể về căn phòng của bạn"}
        </h2>
        <Input
          id="title"
          label="Tiêu đề tin"
          value={form.title}
          maxLength={150}
          hint="Ít nhất 10 ký tự khi gửi duyệt; tối đa 150 ký tự."
          onChange={(event) => change("title", event.target.value)}
        />
        <Textarea
          id="description"
          label={
            form.type === "ROOM_WANTED"
              ? "Nhu cầu tìm phòng"
              : "Mô tả căn phòng"
          }
          value={form.description}
          rows={7}
          maxLength={5000}
          hint="Mô tả không gian và sinh hoạt; ít nhất 30 ký tự khi gửi duyệt. Không ghi địa chỉ cụ thể trong phần công khai."
          onChange={(event) => change("description", event.target.value)}
        />
        <div className="form-grid">
          {numberField(
            "area",
            form.type === "ROOM_WANTED"
              ? "Diện tích mong muốn (m², tùy chọn)"
              : "Diện tích (m²)",
            1,
            10000,
          )}
          {form.type !== "ROOM_WANTED" &&
            numberField("availableSlots", "Số chỗ còn trống", 1, 20)}
          {form.type === "ROOMMATE" &&
            numberField("currentResidents", "Số người đang ở", 0, 20)}
          <Input
            id="availableFrom"
            label="Ngày có thể dọn vào"
            type="date"
            value={form.availableFrom}
            onChange={(event) => change("availableFrom", event.target.value)}
          />
        </div>
      </div>
    );

  if (step === 2)
    return (
      <div className="form-stack">
        <h2>Chi phí & Vị trí</h2>
        <p className="text-muted">
          {form.type === "ROOM_WANTED"
            ? "Nhập ngân sách tối đa mỗi tháng và khu vực bạn muốn tìm."
            : "Các khoản tiền tính bằng VNĐ mỗi tháng. Ghi rõ mức cho một người hay cả phòng trong mô tả."}
        </p>
        <div className="form-grid">
          {numberField(
            "rent",
            form.type === "ROOM_WANTED"
              ? "Ngân sách tối đa / tháng"
              : form.type === "ROOM_RENTAL"
                ? "Giá thuê / phòng / tháng"
                : "Giá thuê / người / tháng",
            1,
          )}
          {form.type !== "ROOM_WANTED" && (
            <>
              {numberField("deposit", "Tiền cọc ban đầu")}
              {numberField("electricityCost", "Tiền điện dự kiến / tháng")}
              {numberField("waterCost", "Tiền nước / tháng")}
              {numberField("internetCost", "Internet / tháng")}
              {numberField("otherCost", "Chi phí khác / tháng")}
            </>
          )}
        </div>
        {form.type !== "ROOM_WANTED" && (
          <Textarea
            id="costNote"
            label="Ghi chú cách tính chi phí"
            rows={3}
            value={form.costNote}
            maxLength={500}
            onChange={(event) => change("costNote", event.target.value)}
          />
        )}
        <div className="form-grid">
          <Select
            id="provinceCode"
            label="Tỉnh / thành phố"
            value={form.provinceCode}
            onChange={(event) => {
              change("provinceCode", event.target.value);
              change("wardCode", "");
              change("latitude", "");
              change("longitude", "");
              setWards([]);
            }}
          >
            <option value="">Chọn tỉnh / thành phố</option>
            {provinces.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            id="wardCode"
            label="Phường / xã"
            value={form.wardCode}
            disabled={!form.provinceCode || !wards.length}
            onChange={(event) => {
              change("wardCode", event.target.value);
              change("latitude", "");
              change("longitude", "");
            }}
          >
            <option value="">Chọn phường / xã</option>
            {wards.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
        {locationError && (
          <p role="alert" className="text-danger">
            {locationError}
          </p>
        )}
        {form.type !== "ROOM_WANTED" && (
          <>
            <Input
              id="privateAddress"
              label="Địa chỉ cụ thể (riêng tư)"
              value={form.privateAddress}
              maxLength={300}
              hint="Chỉ chủ tin và admin được xem. Không đưa địa chỉ cụ thể vào tiêu đề, mô tả hoặc ảnh."
              onChange={(event) => change("privateAddress", event.target.value)}
            />
            <h3>Vị trí khu vực trên bản đồ</h3>
            <p className="text-muted">
              Ghim nằm cố định ở giữa. Kéo bản đồ để đưa vị trí phòng đến dưới
              ghim. Vị trí được làm tròn đến khoảng 1 km khi lưu và hiển thị
              công khai.
            </p>
            <Button variant="secondary" onClick={locate} disabled={pending}>
              Lấy vị trí khu vực hiện tại
            </Button>
            <RoomMap
              latitude={form.latitude === "" ? null : Number(form.latitude)}
              longitude={form.longitude === "" ? null : Number(form.longitude)}
              disabled={pending}
              onChange={selectLocation}
            />
          </>
        )}
      </div>
    );

  if (step === 3)
    return (
      <div className="form-stack">
        <h2>
          {form.type === "ROOM_WANTED"
            ? "Tiêu chí sinh hoạt"
            : "Ảnh thực tế & Tiêu chí"}
        </h2>
        {form.type !== "ROOM_WANTED" && (
          <>
            <label className="listing-upload">
              + Chọn ảnh phòng
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={pending || (listing?.photos.length ?? 0) >= 8}
                onChange={(event) => {
                  void upload(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <p className="text-muted">
              Tối đa 8 ảnh, mỗi ảnh 5 MB. Ảnh đầu tiên làm ảnh bìa. Ảnh được nén
              và loại bỏ thông tin GPS.
            </p>
            <div className="listing-photo-editor">
              {listing?.photos.map((photo, index) => (
                <div key={photo.id}>
                  <div className="listing-photo-thumbnail">
                    <Image
                      src={photo.url}
                      alt={`Ảnh phòng ${index + 1}`}
                      fill
                      sizes="(max-width: 600px) 100vw, 35vw"
                      unoptimized
                    />
                  </div>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => removePhoto(photo.id)}
                  >
                    Xóa ảnh {index + 1}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
        <fieldset className="listing-checkboxes">
          <legend>
            {form.type === "ROOM_WANTED"
              ? "Tiện ích mong muốn"
              : "Tiện ích có sẵn"}
          </legend>
          {Object.entries(amenities).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={form.amenities.includes(key as Amenity)}
                onChange={(event) =>
                  change(
                    "amenities",
                    event.target.checked
                      ? [...form.amenities, key as Amenity]
                      : form.amenities.filter((item) => item !== key),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <Select
            id="smokingPreference"
            label="Hút thuốc"
            value={form.smokingPreference}
            onChange={(event) =>
              change("smokingPreference", event.target.value)
            }
          >
            <option value="">Không yêu cầu</option>
            <option value="NO_SMOKING">Không hút thuốc</option>
            <option value="OUTDOOR_ONLY">Chỉ hút ngoài nhà</option>
            <option value="SMOKER">Có hút thuốc</option>
          </Select>
          <Select
            id="petPreference"
            label="Thú cưng"
            value={form.petPreference}
            onChange={(event) => change("petPreference", event.target.value)}
          >
            <option value="">Không yêu cầu</option>
            <option value="NO_PETS">Không nuôi thú cưng</option>
            <option value="PET_FRIENDLY">Chấp nhận thú cưng</option>
            <option value="HAS_PETS">Đang nuôi thú cưng</option>
          </Select>
          <Select
            id="quietLevel"
            label="Nếp sinh hoạt"
            value={form.quietLevel}
            onChange={(event) => change("quietLevel", event.target.value)}
          >
            <option value="">Không yêu cầu</option>
            <option value="QUIET">Ưu tiên yên tĩnh</option>
            <option value="BALANCED">Cân bằng</option>
            <option value="SOCIAL">Thích giao lưu</option>
          </Select>
        </div>
        <Textarea
          id="roommateNote"
          label={
            form.type === "ROOM_WANTED"
              ? "Mong muốn thêm"
              : "Mong muốn về người cùng nhà"
          }
          value={form.roommateNote}
          rows={4}
          maxLength={1000}
          onChange={(event) => change("roommateNote", event.target.value)}
        />
      </div>
    );

  if (step === 4)
    return (
      <div className="form-stack">
        <h2>Kiểm tra trước khi gửi duyệt</h2>
        <p className="text-muted">
          Kiểm tra ảnh, chi phí và thông tin công khai. Tin chỉ hiển thị sau khi
          admin duyệt.
        </p>
        {preview ? (
          <>
            <h3>{preview.title || "Chưa có tiêu đề"}</h3>
            <ListingContent listing={preview} preview />
          </>
        ) : (
          <p>Lưu bản nháp để xem trước nội dung.</p>
        )}
      </div>
    );

  return null;
}
