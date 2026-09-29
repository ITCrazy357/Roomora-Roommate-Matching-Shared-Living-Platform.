"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch } from "@/lib/api";
import {
  Listing,
  listingError,
  listingLocation,
  listingStatuses,
} from "@/lib/listings";
import { Button, ButtonLink, ErrorState, LoadingState } from "../ui";
import { SaveListing } from "./listing-card";
import { ListingContent } from "./listing-content";

function ListingDetailView({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (loading) return;
    const controller = new AbortController();
    apiFetch<Listing>(`/listings/${id}`, { signal: controller.signal })
      .then(setListing)
      .catch((error) => {
        if (!controller.signal.aborted) setError(listingError(error));
      });
    return () => controller.abort();
  }, [id, loading, user?.id, retry]);
  async function close() {
    if (!listing) return;
    setPending(true);
    setError("");
    try {
      setListing(
        await apiFetch<Listing>(`/listings/${id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: listing.version }),
        }),
      );
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  async function setFull() {
    if (!listing?.version) return;
    setPending(true);
    setError("");
    try {
      setListing(
        await apiFetch<Listing>(`/listings/${id}/full`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: listing.version,
            isFull: !listing.isFull,
          }),
        }),
      );
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  if (!listing)
    return (
      <section className="container page-section">
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button
                onClick={() => {
                  setError("");
                  setRetry((value) => value + 1);
                }}
              >
                Thử lại
              </Button>
            }
          />
        ) : (
          <LoadingState />
        )}
      </section>
    );
  const owner = user?.id === listing.ownerId;
  return (
    <section className="container page-section listings-page">
      <ButtonLink href="/tim-phong" variant="secondary">
        ← Khám phá phòng
      </ButtonLink>
      <div className="listing-page-heading">
        <div>
          <h1>{listing.title || "Tin chưa có tiêu đề"}</h1>
          <p className="text-muted">
            {listingLocation(listing)} · {listingStatuses[listing.status]}
          </p>
        </div>
        {!owner && listing.status === "PUBLISHED" && (
          <SaveListing key={`${id}:${user?.id}`} listing={listing} />
        )}
      </div>
      {error && <ErrorState message={error} />}
      {owner && (
        <div className="listing-owner-bar">
          <p>
            {listing.status === "PUBLISHED"
              ? "Tin của bạn đang hiển thị. Khi sửa nội dung hoặc ảnh, tin sẽ trở về bản nháp để duyệt lại."
              : "Chỉ bạn và quản trị viên được xem nội dung chưa công khai."}
          </p>
          <div className="listing-actions">
            {listing.status === "PUBLISHED" && listing.type === "ROOMMATE" && (
              <Button variant="secondary" disabled={pending} onClick={setFull}>
                {listing.isFull ? "Mở nhận người ở ghép" : "Đánh dấu đã đủ"}
              </Button>
            )}
            <ButtonLink
              href={`/tin-cua-toi/${id}/chinh-sua`}
              variant="secondary"
            >
              Chỉnh sửa tin
            </ButtonLink>
            {listing.status !== "CLOSED" && (
              <Button variant="secondary" disabled={pending} onClick={close}>
                Đóng tin
              </Button>
            )}
          </div>
        </div>
      )}
      {owner && listing.rejectionReason && (
        <ErrorState message={`Lý do từ chối: ${listing.rejectionReason}`} />
      )}
      <ListingContent listing={listing} />
    </section>
  );
}

export function ListingDetail({ id }: { id: string }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="container page-section">
        <LoadingState />
      </div>
    );
  return <ListingDetailView key={`${id}:${user?.id ?? "guest"}`} id={id} />;
}
