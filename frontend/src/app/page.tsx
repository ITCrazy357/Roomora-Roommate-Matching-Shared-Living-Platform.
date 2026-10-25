import { HomeSlideshow } from "@/components/home-slideshow";
import { HomeJourney } from "@/components/home-journey";
import { HomeListings } from "@/components/listings/home-listings";
import { ButtonLink } from "@/components/ui";
import type { Metadata } from "next";
import { siteOrigin } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Roomora — Tìm phòng trọ và người ở ghép" },
  description:
    "Tìm phòng cho thuê, người ở ghép và nhu cầu tìm phòng trên Roomora. Xem giá thuê, chi phí, tiện ích và khu vực trước khi kết nối.",
  ...(siteOrigin() ? { alternates: { canonical: siteOrigin() } } : {}),
};

export default function Home() {
  return (
    <div className="container home">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <h1 id="home-title">
            Tìm chỗ ở.
            <br />
            <span>Chọn người cùng nhà.</span>
          </h1>
          <p>
            Xem phòng cho thuê, tìm bạn ở ghép hoặc đăng nhu cầu tìm phòng của
            bạn. So sánh chi phí, tiện ích và khu vực trước khi kết nối.
          </p>
          <div className="hero-actions">
            <ButtonLink href="/tim-phong" arrow>
              Khám phá tin đăng
            </ButtonLink>
            <ButtonLink href="/dang-tin" variant="secondary">
              Đăng tin
            </ButtonLink>
          </div>
        </div>
        <HomeSlideshow />
      </section>
      <HomeJourney />
      <HomeListings />
    </div>
  );
}
