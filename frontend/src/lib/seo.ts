// Server-only configuration. Never derive canonical URLs from the request Host.
export function siteOrigin(): string | undefined {
  const value = process.env.SITE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  const loopback =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !loopback) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "SITE_URL cần HTTPS hoặc localhost, không có đường dẫn hay thông tin đăng nhập.",
    );
  return url.origin;
}

export function serverApiUrl(path: string) {
  let base =
    process.env.API_SERVER_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base?.startsWith("/") && process.env.API_PROXY_TARGET)
    base = `${process.env.API_PROXY_TARGET.replace(/\/+$/, "")}${base}`;
  if (!base || !/^https?:\/\//.test(base)) return undefined;
  return `${base.replace(/\/+$/, "")}${path}`;
}

export const privatePagePrefixes = [
  "/admin",
  "/tai-khoan",
  "/onboarding",
  "/tin-cua-toi",
  "/da-luu",
  "/ket-noi",
  "/dich-vu",
  "/ho-so",
  "/dev",
  "/dang-tin",
  "/tin-nhan",
  "/thong-bao",
  "/nha-chung",
  "/lich-xem-phong",
  "/ho-tro",
  "/mcp",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dat-lai-mat-khau",
  "/xac-minh-email",
  "/gui-lai-xac-minh",
];
