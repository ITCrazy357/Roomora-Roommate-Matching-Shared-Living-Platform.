import type { Metadata } from "next";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "Cài đặt tài khoản" };

export default function SettingsPage() {
  return (
    <section className="container account-page">
      <div className="account-heading">
        <span className="eyebrow">QUYỀN RIÊNG TƯ & BẢO MẬT</span>
        <h1>Cài đặt tài khoản</h1>
        <p className="text-muted">
          Chọn thông tin được công khai và kiểm soát các phiên đăng nhập.
        </p>
      </div>
      <SettingsPanel />
    </section>
  );
}
