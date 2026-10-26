import Image from "next/image";
import {
  isPublicCloudinaryImage,
  isLocalPublicImage,
  publicImageLoader,
} from "@/lib/public-image";
import {
  amenities,
  Listing,
  listingDate,
  listingLocation,
  money,
  listingHasRoom,
  listingLabel,
  listingCostUnit,
  listingAvailability,
} from "@/lib/listings";
import { Card } from "../ui";
import { AreaMap } from "./area-map";
import { PersonAvatar } from "../person-avatar";
import Link from "next/link";
import { IdentityBadge } from "../identity/identity-badge";

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

export function ListingContent({
  listing,
  preview = false,
  moderation = false,
}: {
  listing: Listing;
  preview?: boolean;
  moderation?: boolean;
}) {
  const costUnit = listingCostUnit(listing.type);
  const hasRoom = listingHasRoom(listing);
  const seekingRoom = !hasRoom;
  const costs = [
    [`Tiền thuê / ${costUnit} / tháng`, listing.rent],
    [`Điện dự kiến / ${costUnit} / tháng`, listing.electricityCost],
    [`Nước / ${costUnit} / tháng`, listing.waterCost],
    [`Internet / ${costUnit} / tháng`, listing.internetCost],
    [`Chi phí khác / ${costUnit} / tháng`, listing.otherCost],
  ] as const;
  const total =
    (listing.rent ?? 0) +
    listing.electricityCost +
    listing.waterCost +
    listing.internetCost +
    listing.otherCost;
  return (
    <>
      {hasRoom && listing.photos.length > 0 && (
        <div className="listing-gallery">
          {listing.photos.map((photo, index) => (
            <div key={photo.id}>
              <Image
                src={photo.url}
                alt={`${listing.title} — ảnh ${index + 1}`}
                fill
                sizes={index === 0 ? "(max-width: 700px) 100vw, 65vw" : "30vw"}
                loader={
                  isPublicCloudinaryImage(photo.url)
                    ? publicImageLoader
                    : undefined
                }
                unoptimized={
                  !isPublicCloudinaryImage(photo.url) &&
                  !isLocalPublicImage(photo.url)
                }
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      )}
      <div className="listing-facts">
        {[
          ...(hasRoom || listing.type === "ROOM_WANTED"
            ? [
                [
                  listing.type === "ROOM_WANTED"
                    ? "Diện tích mong muốn"
                    : "Diện tích",
                  listing.area === null
                    ? "Chưa cung cấp"
                    : `${listing.area} m²`,
                ],
              ]
            : []),
          ["Trạng thái", listingAvailability(listing)],
          ...(listing.type === "ROOMMATE" && hasRoom
            ? [
                [
                  "Đang ở",
                  `${listing.currentResidents}/${listing.currentResidents + listing.availableSlots} người`,
                ],
              ]
            : []),
          ...(listing.type === "ROOM_RENTAL"
            ? [
                [
                  "Dọn vào",
                  listing.availableFrom
                    ? listingDate(listing.availableFrom)
                    : "Trao đổi thêm",
                ],
              ]
            : []),
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
              {seekingRoom
                ? listing.type === "ROOMMATE"
                  ? "Nhu cầu xin ở ghép"
                  : "Nhu cầu tìm phòng"
                : "Về căn phòng"}
            </h2>
            <p className="listing-text">
              {listing.description || "Chưa có mô tả."}
            </p>
          </Card>
          {hasRoom && (
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
                  <dt>Tổng dự kiến / {costUnit} / tháng</dt>
                  <dd>{money(total)}</dd>
                </div>
                <div>
                  <dt>Tiền cọc ban đầu / {costUnit}</dt>
                  <dd>{money(listing.deposit)}</dd>
                </div>
              </dl>
              <p className="text-muted">
                {listing.costNote ||
                  "Chi phí điện là mức dự kiến. Trao đổi với người đăng để xác nhận cách tính và mức sử dụng thực tế."}
              </p>
            </Card>
          )}
          {seekingRoom && (
            <Card>
              <h2>Ngân sách</h2>
              <p className="listing-price">
                Tối đa {money(listing.rent)} / tháng
              </p>
              {listing.desiredResidents !== null && (
                <p>Phòng cho {listing.desiredResidents} người ở.</p>
              )}
              <p className="text-muted">
                Người có phòng phù hợp hoặc sắp chuyển đi có thể kết nối để trao
                đổi. Việc thuê hoặc bàn giao cần được chủ phòng chấp thuận, kể
                cả khi chủ phòng không dùng Roomora.
              </p>
            </Card>
          )}
          <Card>
            <h2>
              {seekingRoom ? "Tiện ích mong muốn" : "Tiện ích và nội thất"}
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
            <h2>{seekingRoom ? "Khu vực muốn tìm" : "Vị trí khu vực"}</h2>
            <p>{listingLocation(listing)}</p>
            {hasRoom && (
              <AreaMap
                latitude={listing.latitude}
                longitude={listing.longitude}
              />
            )}
            <p className="listing-privacy">
              {seekingRoom
                ? "Khu vực người đăng muốn tìm phòng; đây không phải địa chỉ của một phòng cụ thể."
                : preview
                  ? "Bản xem trước giữ đúng vị trí bạn đang chọn. Khi lưu và hiển thị công khai, vị trí được làm tròn đến khoảng 1 km. Địa chỉ cụ thể không hiển thị công khai."
                  : "Vị trí bản đồ được làm tròn đến khoảng 1 km và chỉ thể hiện khu vực gần phòng. Địa chỉ cụ thể không hiển thị công khai."}
            </p>
            {hasRoom && listing.privateAddress !== undefined && (
              <p className="listing-review-note">
                Địa chỉ riêng tư (chủ tin / admin):{" "}
                {listing.privateAddress || "Chưa nhập"}
              </p>
            )}
          </Card>
        </div>
        <aside className="listing-summary">
          <Card>
            <span className="content-label">{listingLabel(listing)}</span>
            <p className="listing-price">{money(listing.rent)}</p>
            <p className="text-muted">
              {seekingRoom
                ? "Ngân sách tối đa / tháng"
                : listing.type === "ROOM_RENTAL"
                  ? `/ phòng / tháng · ${listingAvailability(listing)}`
                  : `/ người / tháng · ${listing.currentResidents}/${listing.currentResidents + listing.availableSlots} người đang ở`}
            </p>
            <hr />
            {listing.type === "ROOM_RENTAL" && (
              <p>
                {listing.availableFrom
                  ? `Dọn vào ${listingDate(listing.availableFrom)}`
                  : "Ngày dọn vào: trao đổi thêm"}
              </p>
            )}
            {hasRoom && <p>Tiền cọc: {money(listing.deposit)}</p>}
          </Card>
          <Card>
            <h2>Người đăng tin</h2>
            <div className="listing-owner">
              <PersonAvatar person={listing.owner} />
              <strong>{listing.owner.displayName}</strong>
            </div>
            <IdentityBadge status={listing.owner.identityStatus} />
            {moderation && (
              <Link className="text-link" href="/admin/nguoi-dung">
                Quản lý người dùng →
              </Link>
            )}
            {!preview &&
              !moderation &&
              (listing.owner.profilePublic ? (
                <Link className="text-link" href={`/ho-so/${listing.ownerId}`}>
                  Xem hồ sơ và kết nối →
                </Link>
              ) : (
                <p className="text-muted">
                  Người đăng chưa công khai hồ sơ để nhận kết nối.
                </p>
              ))}
            <p className="text-muted">
              {seekingRoom
                ? "Đây là nhu cầu tìm chỗ ở do người đăng cung cấp."
                : "Thông tin phòng, số người đang ở và chi phí do người đăng cung cấp. Khi ở ghép hoặc nhận bàn giao, cần trao đổi với chủ phòng để được chấp thuận."}
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
