"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  type ListingPage,
  listingTypes,
  type ListingType,
} from "@/lib/listings";
import { useAuth } from "../auth-provider";
import { Button, LoadingState } from "../ui";
import { ListingCard } from "./listing-card";

const types: ListingType[] = ["ROOMMATE", "ROOM_RENTAL", "ROOM_WANTED"];
const descriptions: Record<ListingType, string> = {
  ROOMMATE: "Có phòng tìm người cùng ở, hoặc chưa có phòng muốn xin ở ghép.",
  ROOM_RENTAL: "Phòng cho thuê với giá, diện tích và tiện ích cụ thể.",
  ROOM_WANTED: "Nhu cầu tìm phòng theo khu vực và ngân sách.",
};

function ListingSection({
  type,
  initialResult,
}: {
  type: ListingType;
  initialResult: ListingPage | null;
}) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<ListingPage | null>(initialResult);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (loading || (!userId && initialResult && retry === 0)) return;
    const controller = new AbortController();
    apiFetch<ListingPage>(`/listings?type=${type}&limit=3`, {
      signal: controller.signal,
    })
      .then(setResult)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [type, retry, loading, userId, initialResult]);

  return (
    <section className="home-listing-section" aria-labelledby={`home-${type}`}>
      <div className="home-listing-heading">
        <div>
          <h2 id={`home-${type}`}>{listingTypes[type]}</h2>
          <p className="text-muted">{descriptions[type]}</p>
        </div>
        <Link className="text-link" href={`/tim-phong?type=${type}`}>
          Xem tất cả{result ? ` (${result.total})` : ""} →
        </Link>
      </div>
      {error ? (
        <div role="alert">
          <p>Chưa tải được nhóm tin này.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setError(false);
              setRetry((value) => value + 1);
            }}
          >
            Thử lại
          </Button>
        </div>
      ) : !result ? (
        <LoadingState />
      ) : result.items.length ? (
        <div className="listing-grid">
          {result.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <p className="home-listing-empty">
          Chưa có tin {listingTypes[type].toLowerCase()} được công khai.
        </p>
      )}
    </section>
  );
}

export function HomeListings({
  initial,
}: {
  initial: Record<ListingType, ListingPage | null>;
}) {
  const { user } = useAuth();
  return (
    <div className="home-listings" id="tin-moi">
      {types.map((type) => (
        <ListingSection
          key={`${type}:${user?.id ?? "guest"}`}
          type={type}
          initialResult={initial[type]}
        />
      ))}
    </div>
  );
}
