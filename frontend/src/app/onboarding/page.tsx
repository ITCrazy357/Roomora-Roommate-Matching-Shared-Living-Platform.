import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile-editor";

export const metadata: Metadata = { title: "Hoàn thiện hồ sơ" };

export default function OnboardingPage() {
  return (
    <section className="onboarding-page">
      <div className="container profile-workspace">
        <ProfileEditor onboarding />
      </div>
    </section>
  );
}
