"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

const links = [
  { href: "/", label: "Trang chủ" },
  { href: "/tim-phong", label: "Tìm phòng" },
  { href: "/tim-nguoi-o-ghep", label: "Tìm người ở ghép" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
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
            r<span>.</span>
          </span>
          <span>
            Roomora<small>Hợp người, chung nhà</small>
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
      </nav>
    </header>
  );
}
