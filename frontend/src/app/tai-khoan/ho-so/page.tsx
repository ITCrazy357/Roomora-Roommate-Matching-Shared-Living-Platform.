import type { Metadata } from "next";
import Link from "next/link";
import { ProfileEditor } from "@/components/profile-editor";

export const metadata: Metadata = { title: "Hồ sơ của tôi" };

export default function MyProfilePage() {
  return (
    <section className="container account-page">
      <div className="account-heading account-heading-row">
        <div>
          <span className="eyebrow">TÀI KHOẢN CỦA TÔI</span>
          <h1>Hồ sơ cá nhân</h1>
          <p className="text-muted">
            Cập nhật cách bạn xuất hiện với những người đang tìm bạn cùng nhà.
          </p>
        </div>
        <Link className="button button-secondary" href="/tai-khoan/cai-dat">
          Cài đặt riêng tư
        </Link>
      </div>
      <ProfileEditor />
    </section>
  );
}
