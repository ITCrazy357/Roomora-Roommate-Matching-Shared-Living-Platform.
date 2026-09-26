import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile-editor";

export const metadata: Metadata = { title: "Hoàn thiện hồ sơ" };

export default function OnboardingPage() {
  return (
    <section className="container account-page">
      <div className="account-heading">
        <span className="eyebrow">ONBOARDING NGẮN</span>
        <h1>Cho Roomora biết điều gì phù hợp với bạn</h1>
        <p className="text-muted">
          Chỉ tên hiển thị là bắt buộc. Mọi mục khác đều có thể bổ sung sau.
        </p>
      </div>
      <ProfileEditor onboarding />
    </section>
  );
}
