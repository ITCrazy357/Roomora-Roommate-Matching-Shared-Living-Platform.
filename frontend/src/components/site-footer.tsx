import Link from "next/link";
import { ProfileIcon } from "./profile-icon";
import { ButtonLink } from "./ui";

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
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-invite">
          <span className="footer-house" aria-hidden="true">
            <ProfileIcon name="home" width={56} height={56} />
          </span>
          <div>
            <span className="eyebrow">CHƯƠNG MỚI BẮT ĐẦU TỪ MỘT MÁI NHÀ</span>
            <h2>Một nơi để ở. Một chốn để thuộc về.</h2>
            <p>Tìm căn phòng vừa ý và người cùng nhà hợp nhịp sống của bạn.</p>
          </div>
          <ButtonLink href="/tim-phong">
            Tìm chốn của mình <span aria-hidden="true">↗</span>
          </ButtonLink>
        </div>
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
            <span className="footer-signoff">
              <span aria-hidden="true">✳</span> Ở cùng nhau, sống đúng với mình.
            </span>
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
