"use client";

import Image from "next/image";
import { isPublicCloudinaryImage, publicImageLoader } from "@/lib/public-image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../auth-provider";
import { ButtonLink } from "../ui";
import { ProfileIcon } from "../profile-icon";
import { apiFetch } from "@/lib/api";
import { DeleteListingDraft } from "./delete-listing-draft";
import {
  amenities,
  Listing,
  listingDate,
  listingError,
  listingLocation,
  listingStatuses,
  listingHasRoom,
  listingLabel,
  listingAvailability,
  money,
} from "@/lib/listings";

export function SaveListing({
  listing,
  onChange,
}: {
  listing: Listing;
  onChange?: (saved: boolean) => void;
}) {
  const { user } = useAuth();
  const identity = `${user?.id ?? "guest"}:${listing.id}`;
  const [saveState, setSaveState] = useState({
    identity,
    value: Boolean(listing.saved),
  });
  const saved =
    saveState.identity === identity ? saveState.value : Boolean(listing.saved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!user)
    return (
      <Link
        href="/dang-nhap"
        className="save-button"
        aria-label="Đăng nhập để lưu tin"
      >
        <ProfileIcon name="heart" />
      </Link>
    );
  async function toggle() {
    setPending(true);
    setError("");
    try {
      const result = await apiFetch<{ saved: boolean }>(
        `/listings/${listing.id}/save`,
        { method: saved ? "DELETE" : "POST" },
      );
      setSaveState({ identity, value: result.saved });
      onChange?.(result.saved);
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="save-control">
      <button
        type="button"
        className="save-button"
        aria-label={saved ? "Bỏ lưu tin" : "Lưu tin"}
        aria-pressed={saved}
        disabled={pending}
        onClick={toggle}
      >
        <ProfileIcon name="heart" fill={saved ? "currentColor" : "none"} />
      </button>
      {error && (
        <p className="save-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ListingCard({
  listing,
  manage = false,
  onSave,
  onDelete,
}: {
  listing: Listing;
  manage?: boolean;
  onSave?: (saved: boolean) => void;
  onDelete?: () => void;
}) {
  const hasRoom = listingHasRoom(listing);
  return (
    <article className={`listing-card ${manage ? "listing-card-row" : ""}`}>
      <div className="listing-cover">
        <Link
          href={`/phong/${listing.id}`}
          className="listing-cover-link"
          aria-label={`Xem ${listing.title || "bản nháp"}`}
        >
          {hasRoom && listing.photos[0] ? (
            <Image
              src={listing.photos[0].url}
              alt={`Ảnh phòng: ${listing.title}`}
              fill
              sizes={
                manage
                  ? "220px"
                  : "(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 30vw"
              }
              loader={publicImageLoader}
              unoptimized={!isPublicCloudinaryImage(listing.photos[0].url)}
            />
          ) : (
            <div className="listing-no-photo">
              <ProfileIcon name={hasRoom ? "home" : "search"} />
              <span>
                {!hasRoom
                  ? listing.type === "ROOMMATE"
                    ? "Nhu cầu xin ở ghép"
                    : "Nhu cầu tìm phòng"
                  : "Chưa có ảnh phòng"}
              </span>
            </div>
          )}
        </Link>
        <span className="listing-cover-label">
          {manage
            ? listingStatuses[listing.status]
            : listingAvailability(listing)}
        </span>
        {!manage && <SaveListing listing={listing} onChange={onSave} />}
      </div>
      <div className="listing-card-body">
        <span className="content-label">{listingLabel(listing)}</span>
        {listing.sponsored && (
          <span className="sponsored-label">Được tài trợ</span>
        )}
        <p className="listing-area">
          {listingLocation(listing)}
          {listing.area !== null && (hasRoom || listing.type === "ROOM_WANTED")
            ? ` · ${listing.area} m²`
            : ""}
        </p>
        <h2>
          <Link href={`/phong/${listing.id}`}>
            {listing.title || "Tin chưa có tiêu đề"}
          </Link>
        </h2>
        <p className="listing-price">
          {money(listing.rent)}{" "}
          <small>
            {!hasRoom
              ? "ngân sách / tháng"
              : listing.type === "ROOM_RENTAL"
                ? "/ phòng / tháng"
                : "/ người / tháng"}
          </small>
        </p>
        <div className="listing-tags">
          {listing.type === "ROOMMATE" && hasRoom && (
            <span>
              {listing.currentResidents}/
              {listing.currentResidents + listing.availableSlots} người đang ở
            </span>
          )}
          {listing.isFull && <span>{listingAvailability(listing)}</span>}
          {listing.amenities.slice(0, 3).map((key) => (
            <span key={key}>{amenities[key]}</span>
          ))}
        </div>
        {manage && listing.rejectionReason && (
          <p className="listing-review-note">
            Lý do từ chối: {listing.rejectionReason}
          </p>
        )}
        <div className="listing-card-footer">
          {listing.type === "ROOM_RENTAL" && (
            <span>
              {listing.availableFrom
                ? `Dọn vào ${listingDate(listing.availableFrom)}`
                : "Ngày dọn vào: trao đổi thêm"}
            </span>
          )}
          <span>{listing.owner.displayName}</span>
        </div>
        {manage && (
          <div className="listing-actions">
            {listing.paymentCompleted && (
              <span className="badge">Đã thanh toán đợt đăng này</span>
            )}
            {listing.status === "PUBLISHED" &&
              !listing.isFull &&
              !listing.paymentCompleted && (
                <ButtonLink
                  href={`/dich-vu?listing=${listing.id}`}
                  variant="secondary"
                >
                  Đẩy tin
                </ButtonLink>
              )}
            <ButtonLink
              href={`/tin-cua-toi/${listing.id}/chinh-sua`}
              variant="secondary"
            >
              {listing.status === "DRAFT"
                ? "Tiếp tục bản nháp"
                : "Chỉnh sửa tin"}
            </ButtonLink>
            <Link className="text-link" href={`/phong/${listing.id}`}>
              Xem chi tiết →
            </Link>
            <DeleteListingDraft listing={listing} onDeleted={onDelete} />
          </div>
        )}
      </div>
    </article>
  );
}
