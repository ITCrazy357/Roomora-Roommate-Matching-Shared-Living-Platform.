"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ProfileIcon } from "./profile-icon";

const linkGroups = [
  {
    title: "Khám phá",
    links: [
      { href: "/tim-phong", label: "Tìm một căn phòng" },
      { href: "/tim-nguoi-o-ghep", label: "Tìm người cùng nhà" },
      { href: "/dang-tin", label: "Đăng tin cho thuê" },
    ],
  },
  {
    title: "Góc của bạn",
    links: [
      { href: "/tai-khoan/ho-so", label: "Hồ sơ của tôi" },
      { href: "/ket-noi", label: "Yêu cầu kết nối" },
      { href: "/da-luu", label: "Những căn phòng đã lưu" },
    ],
  },
];

export function SiteFooter() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  if (loading) return null;
  if (user?.role === "ADMIN")
    return (
      <footer className="admin-footer container">
        <span>© Roomora · Khu vực quản trị</span>
        <Link href="/admin/tai-khoan">Bảo mật tài khoản</Link>
        <a href="#main-content">Về đầu trang ↑</a>
      </footer>
    );
  if (pathname !== "/")
    return (
      <footer className="compact-footer container">
        <Link href="/" className="compact-footer-brand">
          Roomora<span className="brand-dot">.</span>
        </Link>
        <span>Hợp người, chung nhà.</span>
        <a href="#main-content">
          Về đầu trang <ProfileIcon name="arrow" />
        </a>
      </footer>
    );
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-about">
            <Link
              href="/"
              className="footer-brand"
              aria-label="Roomora — Trang chủ"
            >
              <span className="brand-symbol" aria-hidden="true">
                <ProfileIcon name="home" />
              </span>
              <span>
                Roomora<span className="brand-dot">.</span>
              </span>
            </Link>
            <p className="footer-tagline">Hợp người, chung nhà.</p>
            <p>
              Mỗi người một nhịp sống. Roomora giúp bạn tìm một không gian và
              những người có thể cùng chia sẻ.
            </p>
          </div>
          {linkGroups.map((group) => (
            <nav
              key={group.title}
              className="footer-links"
              aria-label={group.title}
            >
              <h3>{group.title}</h3>
              {group.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="footer-bottom">
          <p>© Roomora. Hợp người, chung nhà.</p>
          <a href="#main-content">
            Về đầu trang <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
