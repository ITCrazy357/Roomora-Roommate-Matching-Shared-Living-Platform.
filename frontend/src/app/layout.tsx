import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
import { UpdatesProvider } from "@/components/communications/updates-provider";
import { SystemBanner } from "@/components/admin/system-banner";
import { AdminRouteGate } from "@/components/admin/admin-route-gate";
import { ChatWidget } from "@/components/chat-widget";
import { themeScript } from "@/lib/theme";
import { siteOrigin } from "@/lib/seo";
import "./admin.css";
import "./globals.css";
import "./support.css";
import "./chat-widget.css";
import "./profile-editor.css";
import "./listings.css";
import "./people.css";
import "./communications.css";
import "./houses.css";
import "./otp.css";
import "./services.css";
import "./motion.css";
import "./dashboard.css";
import "./house-dashboard.css";

const beVietnam = localFont({
  src: [
    {
      path: "./fonts/BeVietnamPro-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    { path: "./fonts/BeVietnamPro-Medium.ttf", weight: "500", style: "normal" },
    {
      path: "./fonts/BeVietnamPro-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    { path: "./fonts/BeVietnamPro-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-be-vietnam",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  ...(siteOrigin() ? { metadataBase: new URL(siteOrigin()!) } : {}),
  title: {
    default: "Roomora — Hợp người, chung nhà",
    template: "%s | Roomora",
  },
  description:
    "Một nơi ở phù hợp, một người bạn cùng nhà đồng điệu. Khám phá Roomora — Hợp người, chung nhà.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="vi" className={beVietnam.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Đi đến nội dung chính
        </a>
        <AuthProvider>
          <UpdatesProvider>
            <SystemBanner />
            <SiteHeader />
            <main id="main-content" tabIndex={-1}>
              <AdminRouteGate>{children}</AdminRouteGate>
            </main>
            <SiteFooter />
            <ChatWidget />
          </UpdatesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
