import type { Metadata } from "next";
import { ListingDetail } from "@/components/listings/listing-detail";
import { publicListing } from "@/lib/public-listing";
import { siteOrigin } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await publicListing(id);
  if (!listing)
    return { title: "Chi tiết phòng", robots: { index: false, follow: false } };
  const description = listing.description
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const canonical = siteOrigin() ? `${siteOrigin()}/phong/${id}` : undefined;
  return {
    title: listing.title,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      title: listing.title,
      description,
      url: canonical,
      locale: "vi_VN",
      type: "website",
      images: listing.photos.slice(0, 1).map((photo) => ({ url: photo.url })),
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await publicListing(id);
  return <ListingDetail key={id} id={id} initialListing={listing} />;
}
