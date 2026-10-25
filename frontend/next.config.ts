import type { NextConfig } from "next";
import { privatePagePrefixes } from "./src/lib/seo";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backendOrigin = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");
    if (!backendOrigin) return [];

    return [
      ...[
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-protected-resource/api/v1/mcp",
      ].map((path) => ({
        source: path,
        destination: `${backendOrigin}${path}`,
      })),
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(self), geolocation=(self)",
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];

    return [
      { source: "/:path*", headers: baseline },
      ...privatePagePrefixes.flatMap((path) => [
        {
          source: path,
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
        {
          source: `${path}/:path*`,
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
      ]),
      {
        source: "/mcp/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/xac-minh-email",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/dat-lai-mat-khau",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
