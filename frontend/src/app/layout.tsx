import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
import "./profile-editor.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Roomora — Hợp người, chung nhà",
    template: "%s | Roomora",
  },
  description:
    "Một nơi ở phù hợp, một người bạn cùng nhà đồng điệu. Khám phá Roomora — Hợp người, chung nhà.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body>
        <a className="skip-link" href="#main-content">
          Đi đến nội dung chính
        </a>
        <AuthProvider>
          <SiteHeader />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="site-footer">
            <div className="container footer-inner">
              <div>
                <Link href="/" className="footer-brand">
                  Roomora<span>.</span>
                </Link>
                <p>Hợp người, chung nhà.</p>
              </div>
              <p>Một nơi để ở. Một chốn để thuộc về.</p>
              <a href="#main-content">Về đầu trang ↑</a>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
