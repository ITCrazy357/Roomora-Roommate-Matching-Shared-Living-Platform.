import Image from "next/image";
import {
  amenities,
  Listing,
  listingDate,
  listingLocation,
  money,
  listingTypes,
} from "@/lib/listings";
import { Card } from "../ui";
import { RoomMap } from "./room-map";

const lifestyle: Record<string, string> = {
  NO_SMOKING: "Không hút thuốc",
  OUTDOOR_ONLY: "Chỉ hút thuốc ngoài trời",
  SMOKER: "Có hút thuốc",
  NO_PETS: "Không nuôi thú cưng",
  PET_FRIENDLY: "Chấp nhận thú cưng",
  HAS_PETS: "Đang nuôi thú cưng",
  QUIET: "Ưu tiên yên tĩnh",
  BALANCED: "Cân bằng sinh hoạt",
  SOCIAL: "Thích giao lưu",
};

export function AreaMap({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  if (latitude === null || longitude === null)
    return <p className="text-muted">Chưa chọn vị trí khu vực.</p>;
  const center = `${latitude},${longitude}`;
  return (
    <div className="area-map">
      <RoomMap latitude={latitude} longitude={longitude} />
      <a
        className="text-link"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(center)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Mở bản đồ khu vực ↗
      </a>
    </div>
  );
}

export function ListingContent({
  listing,
  preview = false,
}: {
  listing: Listing;
  preview?: boolean;
}) {
  const costs = [
    [
      listing.type === "ROOM_RENTAL"
        ? "Tiền thuê / phòng / tháng"
        : "Tiền thuê / người / tháng",
      listing.rent,
    ],
    ["Điện dự kiến / người / tháng", listing.electricityCost],
    ["Nước / người / tháng", listing.waterCost],
    ["Internet / người / tháng", listing.internetCost],
    ["Chi phí khác / người / tháng", listing.otherCost],
  ] as const;
  const total =
    (listing.rent ?? 0) +
    listing.electricityCost +
    listing.waterCost +
    listing.internetCost +
    listing.otherCost;
  return (
    <>
      {listing.photos.length > 0 && (
        <div className="listing-gallery">
          {listing.photos.map((photo, index) => (
            <div key={photo.id}>
              <Image
                src={photo.url}
                alt={`${listing.title} — ảnh ${index + 1}`}
                fill
                sizes={index === 0 ? "(max-width: 700px) 100vw, 65vw" : "30vw"}
                unoptimized
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      )}
      <div className="listing-facts">
        {[
          ["Diện tích", `${listing.area ?? "—"} m²`],
          ["Trạng thái", listing.isFull ? "Đã đủ" : "Đang nhận liên hệ"],
          ...(listing.type === "ROOMMATE"
            ? [
                [
                  "Đang ở",
                  `${listing.currentResidents}/${listing.currentResidents + listing.availableSlots} người`,
                ],
              ]
            : []),
          ["Dọn vào", listingDate(listing.availableFrom)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="listing-detail-grid">
        <div className="listing-sections">
          <Card>
            <h2>
              {listing.type === "ROOM_WANTED"
                ? "Nhu cầu tìm phòng"
                : "Về căn phòng"}
            </h2>
            <p className="listing-text">
              {listing.description || "Chưa có mô tả."}
            </p>
          </Card>
          {listing.type !== "ROOM_WANTED" && (
            <Card>
              <h2>Chi phí dự kiến hằng tháng</h2>
              <dl className="listing-costs">
                {costs.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{money(value)}</dd>
                  </div>
                ))}
                <div className="listing-total">
                  <dt>Tổng dự kiến / người / tháng</dt>
                  <dd>{money(total)}</dd>
                </div>
                <div>
                  <dt>Tiền cọc ban đầu / người</dt>
                  <dd>{money(listing.deposit)}</dd>
                </div>
              </dl>
              <p className="text-muted">
                {listing.costNote ||
                  "Chi phí điện là mức dự kiến. Trao đổi với người đăng để xác nhận cách tính và mức sử dụng thực tế."}
              </p>
            </Card>
          )}
          {listing.type === "ROOM_WANTED" && (
            <Card>
              <h2>Ngân sách</h2>
              <p className="listing-price">
                Tối đa {money(listing.rent)} / tháng
              </p>
            </Card>
          )}
          <Card>
            <h2>
              {listing.type === "ROOM_WANTED"
                ? "Tiện ích mong muốn"
                : "Tiện ích và nội thất"}
            </h2>
            <div className="listing-amenities">
              {listing.amenities.length ? (
                listing.amenities.map((key) => (
                  <span key={key}>✓ {amenities[key]}</span>
                ))
              ) : (
                <p className="text-muted">Chưa bổ sung tiện ích.</p>
              )}
            </div>
          </Card>
          <Card>
            <h2>Nếp sinh hoạt và tiêu chí</h2>
            <div className="listing-tags">
              {[
                listing.smokingPreference,
                listing.petPreference,
                listing.quietLevel,
              ]
                .filter(Boolean)
                .map((key) => (
                  <span key={key}>{lifestyle[key!] ?? key}</span>
                ))}
            </div>
            <p className="listing-text">
              {listing.roommateNote || "Người đăng chưa bổ sung tiêu chí."}
            </p>
          </Card>
          <Card>
            <h2>Vị trí khu vực</h2>
            <p>{listingLocation(listing)}</p>
            <AreaMap
              latitude={listing.latitude}
              longitude={listing.longitude}
            />
            <p className="listing-privacy">
              {listing.type === "ROOM_WANTED"
                ? "Khu vực người đăng muốn tìm phòng; đây không phải địa chỉ của một phòng cụ thể."
                : preview
                  ? "Bản xem trước giữ đúng vị trí bạn đang chọn. Khi lưu và hiển thị công khai, vị trí được làm tròn đến khoảng 1 km. Địa chỉ cụ thể không hiển thị công khai."
                  : "Vị trí bản đồ được làm tròn đến khoảng 1 km và chỉ thể hiện khu vực gần phòng. Địa chỉ cụ thể không hiển thị công khai."}
            </p>
            {listing.privateAddress !== undefined && (
              <p className="listing-review-note">
                Địa chỉ riêng tư (chủ tin / admin):{" "}
                {listing.privateAddress || "Chưa nhập"}
              </p>
            )}
          </Card>
        </div>
        <aside className="listing-summary">
          <Card>
            <span className="eyebrow">{listingTypes[listing.type]}</span>
            <p className="listing-price">{money(listing.rent)}</p>
            <p className="text-muted">
              {listing.type === "ROOM_WANTED"
                ? "Ngân sách tối đa / tháng"
                : listing.type === "ROOM_RENTAL"
                  ? `/ phòng / tháng · Còn ${listing.availableSlots} phòng`
                  : `/ người / tháng · ${listing.currentResidents}/${listing.currentResidents + listing.availableSlots} người đang ở`}
            </p>
            <hr />
            <p>Dọn vào {listingDate(listing.availableFrom)}</p>
            {listing.type !== "ROOM_WANTED" && (
              <p>Tiền cọc: {money(listing.deposit)}</p>
            )}
          </Card>
          <Card>
            <h2>Người đăng tin</h2>
            <p>{listing.owner.displayName}</p>
            <p className="text-muted">
              Thông tin phòng và chi phí do người đăng cung cấp. Kiểm duyệt nội
              dung chưa thay thế việc xem phòng thực tế.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
