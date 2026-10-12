"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { Button } from "../ui";
import { apiFetch } from "@/lib/api";
import { listingError, type Listing } from "@/lib/listings";

export function DeleteListingDraft({
  listing,
  disabled = false,
  onDeleted,
  onPendingChange,
}: {
  listing: Listing;
  disabled?: boolean;
  onDeleted?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (listing.status !== "DRAFT" || user?.id !== listing.ownerId) return null;

  async function remove() {
    if (pending || disabled) return;
    if (
      !window.confirm(
        `Xóa bản nháp “${listing.title || "Tin chưa có tiêu đề"}”? Bản nháp sẽ được gỡ và ảnh sẽ bị xóa. Lịch sử giao dịch trước đó vẫn được giữ. Thao tác này không thể hoàn tác.`,
      )
    )
      return;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    try {
      await apiFetch(`/listings/${listing.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: listing.version }),
      });
      if (onDeleted) onDeleted();
      else router.replace("/tin-cua-toi");
    } catch (error) {
      setError(listingError(error));
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <div className="listing-delete-control">
      <Button
        variant="secondary"
        className="listing-delete-button"
        disabled={pending || disabled}
        onClick={remove}
      >
        {pending ? "Đang xóa…" : "Xóa bản nháp"}
      </Button>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
