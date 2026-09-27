"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { authErrorMessage } from "@/lib/auth-errors";
import { ProfileIcon } from "./profile-icon";

const links = [
  { href: "/", label: "Trang chủ" },
  { href: "/tim-phong", label: "Tìm phòng" },
  { href: "/tim-nguoi-o-ghep", label: "Tìm người ở ghép" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
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
          href="/"
          className="brand"
          aria-label="Roomora — Trang chủ"
          onClick={() => setOpen(false)}
        >
          <span className="brand-symbol" aria-hidden="true">
            <ProfileIcon name="home" />
          </span>
          <span>
            Roomora<span className="brand-dot">.</span>
            <small>Hợp người, chung nhà</small>
          </span>
        </Link>
        <nav aria-label="Điều hướng chính" className="desktop-nav">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
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
              <Link href="/dang-tin" className="nav-primary">
                + Đăng tin
              </Link>
              <details ref={accountMenu} className="account-menu">
                <summary>{user.displayName}</summary>
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
                  <Link href="/tai-khoan/ho-so">Hồ sơ của tôi</Link>
                  <Link href="/tin-cua-toi">Tin của tôi</Link>
                  <Link href="/da-luu">Tin đã lưu</Link>
                  <Link href="/tai-khoan/cai-dat">Cài đặt</Link>
                  {user.role === "ADMIN" && (
                    <Link href="/admin/tin-dang">Kiểm duyệt tin</Link>
                  )}
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
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {label}
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
            <Link href="/dang-tin" onClick={() => setOpen(false)}>
              + Đăng tin
            </Link>
            <Link href="/tin-cua-toi" onClick={() => setOpen(false)}>
              Tin của tôi
            </Link>
            <Link href="/da-luu" onClick={() => setOpen(false)}>
              Tin đã lưu
            </Link>
            {user.role === "ADMIN" && (
              <Link href="/admin/tin-dang" onClick={() => setOpen(false)}>
                Kiểm duyệt tin
              </Link>
            )}
            <Link href="/tai-khoan/ho-so" onClick={() => setOpen(false)}>
              Hồ sơ của tôi
            </Link>
            <Link href="/tai-khoan/cai-dat" onClick={() => setOpen(false)}>
              Cài đặt
            </Link>
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
