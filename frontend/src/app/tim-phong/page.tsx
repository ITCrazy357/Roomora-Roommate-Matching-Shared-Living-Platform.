import type { Metadata } from "next";
import { ButtonLink, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Tìm phòng" };

export default function RoomsPage() {
  return (
    <section className="container page-section narrow">
      <EmptyState
        title="Một nơi ở hợp với bạn"
        action={<ButtonLink href="/">Về trang chủ</ButtonLink>}
      >
        <p>
          Tính năng tìm phòng đang được chuẩn bị. Bạn chưa thể tìm kiếm hoặc xem
          tin đăng tại đây.
        </p>
        <p>Hẹn bạn sớm quay lại khám phá không gian sống phù hợp.</p>
      </EmptyState>
    </section>
  );
}
