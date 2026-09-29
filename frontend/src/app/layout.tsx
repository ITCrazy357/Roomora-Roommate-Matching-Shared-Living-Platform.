import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
import { UpdatesProvider } from "@/components/communications/updates-provider";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "./profile-editor.css";
import "./listings.css";
import "./people.css";
import "./communications.css";
import "./houses.css";

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
          <UpdatesProvider>
            <SiteHeader />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
            <SiteFooter />
          </UpdatesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
