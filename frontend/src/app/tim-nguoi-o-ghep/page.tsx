import type { Metadata } from "next";
import { ButtonLink, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Tìm người ở ghép" };

export default function RoommatesPage() {
  return (
    <section className="container page-section narrow">
      <EmptyState
        title="Chung nhà, cùng nhịp sống"
        action={<ButtonLink href="/">Về trang chủ</ButtonLink>}
      >
        <p>
          Tính năng tìm người ở ghép đang được chuẩn bị. Chưa có hồ sơ để xem
          hoặc gửi lời kết nối.
        </p>
        <p>Một khởi đầu cho những người bạn cùng nhà phù hợp hơn.</p>
      </EmptyState>
    </section>
  );
}
