import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="container page-section narrow">
      <EmptyState
        title="Không tìm thấy trang"
        action={<ButtonLink href="/">Về trang chủ</ButtonLink>}
      >
        <p>Trang bạn đang tìm không tồn tại hoặc chưa được mở.</p>
      </EmptyState>
    </section>
  );
}
