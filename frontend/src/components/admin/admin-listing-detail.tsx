"use client";
import { type Listing } from "@/lib/listings";
import { ListingContent } from "../listings/listing-content";
import { AdminResult, useAdminPage } from "./admin-shared";
export function AdminListingDetail({ id }: { id: string }) {
  const { data, error, reload } = useAdminPage<Listing>(
    `/admin/listings/${id}`,
  );
  return data ? (
    <section className="admin-page">
      <h1>{data.title}</h1>
      <p>
        Phiên bản {data.version} · {data.status}
      </p>
      <ListingContent listing={data} moderation />
    </section>
  ) : (
    <AdminResult error={error} reload={reload} />
  );
}
