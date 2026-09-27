"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Listing,
  ListingPage,
  listingError,
  listingLocation,
  listingStatuses,
  money,
} from "@/lib/listings";
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  Select,
  Textarea,
} from "../ui";
import { ListingContent } from "./listing-content";

function ModerationDetail({
  id,
  onReviewed,
}: {
  id: string;
  onReviewed: () => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Listing>(`/admin/listings/${id}`, { signal: controller.signal })
      .then(setListing)
      .catch((error) => {
        if (!controller.signal.aborted) setError(listingError(error));
      });
    return () => controller.abort();
  }, [id, retry]);
  async function review(decision: "PUBLISHED" | "REJECTED") {
    if (!listing) return;
    if (decision === "REJECTED" && !reason.trim()) {
      setError("Nhập lý do để người đăng biết cần chỉnh sửa gì.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await apiFetch<Listing>(`/admin/listings/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: reason.trim() || undefined,
          version: listing.version,
        }),
      });
      onReviewed();
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
    }
  }
  if (!listing)
    return error ? (
      <ErrorState
        message={error}
        action={
          <Button
            onClick={() => {
              setError("");
              setRetry((value) => value + 1);
            }}
          >
            Tải lại tin
          </Button>
        }
      />
    ) : (
      <LoadingState />
    );
  return (
    <div className="moderation-detail">
      <Card>
        <span className="badge">{listingStatuses[listing.status]}</span>
        <h2>{listing.title}</h2>
        <p>
          {listing.owner.displayName} · {listingLocation(listing)}
        </p>
        <p className="text-muted text-sm">
          Mã tin: {listing.id} · Phiên bản: {listing.version}
        </p>
      </Card>
      <ListingContent listing={listing} />
      <Card>
        <h2>Quyết định kiểm duyệt</h2>
        <p className="text-muted">
          Đọc nội dung, kiểm tra ảnh thực tế và các khoản chi phí trước khi
          duyệt.
        </p>
        {error && <ErrorState message={error} />}
        {listing.status === "PENDING" ? (
          <>
            <Textarea
              id="reviewReason"
              label="Lý do / Ghi chú gửi người đăng"
              value={reason}
              maxLength={1000}
              rows={4}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              hint="Bắt buộc khi từ chối. Nêu rõ thông tin cần bổ sung."
            />
            <div className="listing-actions">
              <Button disabled={pending} onClick={() => review("PUBLISHED")}>
                Duyệt & Công khai
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => review("REJECTED")}
              >
                Từ chối kèm lý do
              </Button>
            </div>
          </>
        ) : (
          <p>Tin này không ở trạng thái chờ duyệt.</p>
        )}
      </Card>
      {Boolean(listing.reviews?.length) && (
        <Card>
          <h2>Lịch sử kiểm duyệt</h2>
          <ul className="listing-review-history">
            {listing.reviews?.map((review) => (
              <li key={review.id}>
                <strong>{listingStatuses[review.decision]}</strong>
                <span>
                  {" "}
                  · {new Date(review.createdAt).toLocaleString("vi-VN")} · phiên
                  bản {review.version}
                </span>
                {review.reason && <p>{review.reason}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function ListingModeration() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    key: string;
    data?: ListingPage;
    error?: string;
  }>({ key: "" });
  const path = `/admin/listings?status=${status}&page=${page}&limit=6`;
  const key = `${path}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<ListingPage>(path, { signal: controller.signal })
      .then((data) => {
        if (page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
        else setResult({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: listingError(error) });
      });
    return () => controller.abort();
  }, [path, key, page]);
  const id = selected ?? result.data?.items[0]?.id;
  return (
    <section className="container page-section listings-page">
      <div className="listing-page-heading">
        <div>
          <span className="eyebrow">QUẢN TRỊ ROOMORA</span>
          <h1>Kiểm duyệt tin đăng</h1>
          <p className="text-muted">
            Kiểm tra chất lượng nội dung, hình ảnh và chi phí trước khi công
            khai.
          </p>
        </div>
        <Select
          id="moderationStatus"
          label="Trạng thái tin"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
            setSelected(null);
            setNotice("");
          }}
        >
          {Object.entries(listingStatuses)
            .filter(([key]) => key !== "DRAFT")
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </Select>
      </div>
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {result.key !== key ? (
        <LoadingState />
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
        <div className="moderation-grid">
          <aside className="moderation-queue">
            <h2>
              {result.data?.total ?? 0} tin{" "}
              {listingStatuses[
                status as keyof typeof listingStatuses
              ].toLowerCase()}
            </h2>
            {result.data?.items.map((listing) => (
              <button
                key={listing.id}
                type="button"
                className="moderation-item"
                aria-pressed={id === listing.id}
                onClick={() => setSelected(listing.id)}
              >
                {listing.photos[0] && (
                  <Image
                    src={listing.photos[0].url}
                    alt=""
                    width={80}
                    height={70}
                    unoptimized
                  />
                )}
                <span>
                  <strong>{listing.title}</strong>
                  <span>{money(listing.rent)}</span>
                  <small>{listing.owner.displayName}</small>
                </span>
              </button>
            ))}
            {Boolean(result.data && result.data.pages > 1) && (
              <nav
                className="listing-pagination"
                aria-label="Phân trang kiểm duyệt"
              >
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((value) => value - 1);
                    setSelected(null);
                  }}
                >
                  ←
                </Button>
                <span>
                  {page} / {result.data?.pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= (result.data?.pages ?? 0)}
                  onClick={() => {
                    setPage((value) => value + 1);
                    setSelected(null);
                  }}
                >
                  →
                </Button>
              </nav>
            )}
          </aside>
          {id ? (
            <ModerationDetail
              key={id}
              id={id}
              onReviewed={() => {
                setSelected(null);
                setRetry((value) => value + 1);
                setNotice("Đã lưu quyết định kiểm duyệt.");
              }}
            />
          ) : (
            <Card>
              <h2>Đã xử lý hết các tin trong danh sách</h2>
              <p className="text-muted">
                Chọn trạng thái khác để xem các tin đã duyệt hoặc cần chỉnh sửa.
              </p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
