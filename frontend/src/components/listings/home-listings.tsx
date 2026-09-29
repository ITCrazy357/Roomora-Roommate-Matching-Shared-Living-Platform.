"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  type ListingPage,
  listingTypes,
  type ListingType,
} from "@/lib/listings";
import { Button, ButtonLink, LoadingState } from "../ui";
import { ListingCard } from "./listing-card";

const types: ListingType[] = ["ROOMMATE", "ROOM_RENTAL", "ROOM_WANTED"];

export function HomeListings() {
  const [sections, setSections] = useState<ListingPage[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      types.map((type) =>
        apiFetch<ListingPage>(`/listings?type=${type}&limit=3`, {
          signal: controller.signal,
        }),
      ),
    )
      .then((data) => { setSections(data); setError(false); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSections(null);
          setError(true);
        }
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <section className="home-listings" aria-label="Tin đăng mới nhất">
      <div className="section-heading">
        <div>
          <span className="eyebrow">KHÁM PHÁ CHỖ Ở</span>
          <h2>Tin đăng mới trên Roomora</h2>
        </div>
        <ButtonLink href="/tim-phong" variant="secondary">
          Xem tất cả →
        </ButtonLink>
      </div>
    {error && <p role="alert">Không tải được tin đăng. <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>Thử lại</Button></p>}
    {!sections && !error && <LoadingState />}
      {sections?.map((section, index) => (
        <div className="home-listing-section" key={types[index]}>
          <h2>{listingTypes[types[index]]}</h2>
          {section.items.length ? (
            <div className="listing-grid">
              {section.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <p className="text-muted">
              Chưa có tin công khai trong khu vực này.
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
