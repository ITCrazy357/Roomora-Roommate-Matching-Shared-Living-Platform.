"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { authErrorMessage } from "@/lib/auth-errors";
import { ProfileIcon } from "./profile-icon";
import { useUpdates } from "./communications/updates-provider";
import { adminLinks } from "@/lib/admin";
import { PersonAvatar } from "./person-avatar";

const userMenu = [
  { href: "/tai-khoan/ho-so", label: "Hồ sơ của tôi" },
  { href: "/ket-noi", label: "Yêu cầu kết nối" },
  { href: "/ket-noi?tab=accepted", label: "Đã kết nối" },
  { href: "/nha-chung", label: "Nhà chung" },
  { href: "/lich-xem-phong", label: "Lịch hẹn" },
  { href: "/thong-bao", label: "Thông báo" },
  { href: "/tin-cua-toi", label: "Tin của tôi" },
  { href: "/da-luu", label: "Tin đã lưu" },
  { href: "/tai-khoan/cai-dat", label: "Cài đặt" },
];

const links = [
  { href: "/", label: "Trang chủ" },
  { href: "/tim-phong", label: "Tìm phòng" },
  { href: "/tim-nguoi-o-ghep", label: "Tìm người ở ghép" },
  { href: "/tin-nhan", label: "Tin nhắn" },
  { href: "/nha-chung", label: "Nhà chung" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const navigation = isAdmin ? [adminLinks[0]] : links;
  const menu = isAdmin
    ? [...adminLinks, { href: "/admin/tai-khoan", label: "Bảo mật tài khoản" }]
    : userMenu;
  const updates = useUpdates();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);

  async function handleLogout() {
    setPending(true);
    setError("");
    try {
      await logout();
      setOpen(false);
      router.replace("/dang-nhap");
      router.refresh();
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && accountMenu.current?.open) {
          accountMenu.current.open = false;
          accountMenu.current.querySelector("summary")?.focus();
        }
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          if (accountMenu.current) accountMenu.current.open = false;
        }
      }}
    >
      <div className="container header-inner">
        <Link
          href={isAdmin ? "/admin/tin-dang" : "/"}
          className="brand"
          aria-label="Roomora — Trang chủ"
          onClick={() => setOpen(false)}
        >
          <span className="brand-symbol" aria-hidden="true">
            <ProfileIcon name="home" />
          </span>
          <span>
            Roomora<span className="brand-dot">.</span>
            <small>
              {isAdmin ? "Khu vực quản trị" : "Hợp người, chung nhà"}
            </small>
          </span>
        </Link>
        <nav aria-label="Điều hướng chính" className="desktop-nav">
          {navigation.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
              {href === "/tin-nhan" && updates.messages > 0 && (
                <span className="nav-count">{updates.messages}</span>
              )}
            </Link>
          ))}
          {!loading && !user && (
            <>
              <Link href="/dang-nhap">Đăng nhập</Link>
              <Link href="/dang-ky" className="nav-primary">
                Tạo tài khoản
              </Link>
            </>
          )}
          {!loading && user && (
            <>
              {!isAdmin && (
                <>
                  <Link
                    href="/thong-bao"
                    aria-label={`Thông báo, ${updates.notifications} chưa đọc`}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                    </svg>
                    {updates.notifications > 0 && (
                      <span className="nav-count">{updates.notifications}</span>
                    )}
                  </Link>
                  <Link href="/dang-tin" className="nav-primary">
                    + Đăng tin
                  </Link>
                </>
              )}
              <details ref={accountMenu} className="account-menu">
                <summary>
                  <PersonAvatar person={user} />
                  {user.displayName}
                  {isAdmin && <span className="admin-role-tag">ADMIN</span>}
                </summary>
                <nav
                  aria-label="Menu tài khoản"
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest("a") &&
                      accountMenu.current
                    )
                      accountMenu.current.open = false;
                  }}
                >
                  {menu.map((link) => (
                    <Link key={link.href} href={link.href}>
                      {link.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    className="nav-button"
                    disabled={pending}
                    onClick={handleLogout}
                  >
                    Đăng xuất
                  </button>
                </nav>
              </details>
            </>
          )}
        </nav>
        <button
          ref={toggle}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
          <span>Menu</span>
        </button>
      </div>
      <nav
        id="mobile-navigation"
        aria-label="Điều hướng trên điện thoại"
        className="mobile-nav container"
        hidden={!open}
      >
        {navigation.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
            {href === "/tin-nhan" && updates.messages > 0 && (
              <span className="nav-count">{updates.messages}</span>
            )}
          </Link>
        ))}
        {!loading && !user && (
          <>
            <Link href="/dang-nhap" onClick={() => setOpen(false)}>
              Đăng nhập
            </Link>
            <Link href="/dang-ky" onClick={() => setOpen(false)}>
              Tạo tài khoản
            </Link>
          </>
        )}
        {!loading && user && (
          <>
            {!isAdmin && (
              <Link href="/dang-tin" onClick={() => setOpen(false)}>
                + Đăng tin
              </Link>
            )}
            {menu
              .filter(
                (link) => !navigation.some((item) => item.href === link.href),
              )
              .map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            <button
              type="button"
              className="mobile-nav-button"
              disabled={pending}
              onClick={handleLogout}
            >
              Đăng xuất
            </button>
          </>
        )}
      </nav>
      {error && (
        <p className="container error-state" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}
