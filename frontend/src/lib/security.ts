export function contentSecurityPolicy(
  nonce: string,
  options: {
    apiBase?: string;
    development: boolean;
    https: boolean;
  },
) {
  let apiOrigin = "";
  if (options.apiBase && !options.apiBase.startsWith("/")) {
    const api = new URL(options.apiBase);
    if (
      !["http:", "https:"].includes(api.protocol) ||
      api.username ||
      api.password
    )
      throw new Error("Invalid public API origin");
    apiOrigin = api.origin;
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ""}`,
    // Leaflet, charts and React controls use inline style attributes, not scripts.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${apiOrigin}${options.development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    `img-src 'self' data: blob: https://res.cloudinary.com ${apiOrigin}`,
    `media-src 'self' blob: https://res.cloudinary.com ${apiOrigin}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
