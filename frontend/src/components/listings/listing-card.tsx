"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../auth-provider";
import { ButtonLink } from "../ui";
import { apiFetch } from "@/lib/api";
import {
  amenities,
  Listing,
  listingDate,
  listingError,
  listingLocation,
  listingStatuses,
  listingTypes,
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
  const [saved, setSaved] = useState(Boolean(listing.saved));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!user)
    return (
      <Link
        href="/dang-nhap"
        className="save-button"
        aria-label="Đăng nhập để lưu tin"
      >
        ♡
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
      setSaved(result.saved);
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
        {saved ? "♥" : "♡"}
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
}: {
  listing: Listing;
  manage?: boolean;
  onSave?: (saved: boolean) => void;
}) {
  return (
    <article className={`listing-card ${manage ? "listing-card-row" : ""}`}>
      <div className="listing-cover">
        <Link
          href={`/phong/${listing.id}`}
          aria-label={`Xem ${listing.title || "bản nháp"}`}
        >
          {listing.photos[0] ? (
            <Image
              src={listing.photos[0].url}
              alt={`Ảnh phòng: ${listing.title}`}
              fill
              sizes={
                manage
                  ? "220px"
                  : "(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 30vw"
              }
              unoptimized
            />
          ) : (
            <div className="listing-no-photo">
              <span aria-hidden="true">⌂</span>
              <span>Chưa có ảnh phòng</span>
            </div>
          )}
        </Link>
        <span className="listing-cover-label">
          {manage
            ? listingStatuses[listing.status]
            : listing.isFull
              ? "Đã đủ"
              : listing.type === "ROOM_WANTED"
                ? "Đang tìm phòng"
                : `Còn ${listing.availableSlots} chỗ`}
        </span>
        {!manage && <SaveListing listing={listing} onChange={onSave} />}
      </div>
      <div className="listing-card-body">
        <span className="eyebrow">{listingTypes[listing.type]}</span>
        <p className="listing-area">
          {listingLocation(listing)} · {listing.area ?? "—"} m²
        </p>
        <h2>
          <Link href={`/phong/${listing.id}`}>
            {listing.title || "Tin chưa có tiêu đề"}
          </Link>
        </h2>
        <p className="listing-price">
          {money(listing.rent)}{" "}
          <small>
            {listing.type === "ROOM_WANTED"
              ? "ngân sách / tháng"
              : listing.type === "ROOM_RENTAL"
                ? "/ phòng / tháng"
                : "/ người / tháng"}
          </small>
        </p>
        <div className="listing-tags">
          {listing.type === "ROOMMATE" && (
            <span>
              {listing.currentResidents}/
              {listing.currentResidents + listing.availableSlots} người đang ở
            </span>
          )}
          {listing.isFull && <span>Đã đủ</span>}
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
          <span>Dọn vào {listingDate(listing.availableFrom)}</span>
          <span>{listing.owner.displayName}</span>
        </div>
        {manage && (
          <div className="listing-actions">
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
          </div>
        )}
      </div>
    </article>
  );
}
