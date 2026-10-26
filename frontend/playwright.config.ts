import { defineConfig, devices } from "@playwright/test";

const database = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.ROOMORA_E2E_FIXTURE !== "true" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !["/roomora_operations", "/roomora_ui"].includes(database.pathname)
)
  throw new Error("Browser tests require an isolated fixture database");
const baseURL = "http://127.0.0.1:3411";
const api = "http://127.0.0.1:5411";
const env = {
  NODE_ENV: "test",
  PORT: "5411",
  DATABASE_URL: process.env.DATABASE_URL!,
  FRONTEND_ORIGIN: baseURL,
  AUTH_DEV_EXPOSE_LINKS: "true",
  AUTH_OTP_SECRET: "browser-tests-only-otp-secret-2026-at-least32",
  IDENTITY_DECLARATION_REQUIRED: "true",
  IDENTITY_ENCRYPTION_KEY: "11".repeat(32),
  REDIS_URL: "",
  BILLING_RECONCILE_ENABLED: "false",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  OPENAI_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_REDIRECT_URI: "",
  PAYOS_CLIENT_ID: "",
  PAYOS_API_KEY: "",
  PAYOS_CHECKSUM_KEY: "",
  MOMO_PARTNER_CODE: "",
  MOMO_ACCESS_KEY: "",
  MOMO_SECRET_KEY: "",
  MOMO_IPN_URL: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `"${process.execPath}" ../backend/dist/main.js`,
      url: `${api}/api/v1/health/ready`,
      env,
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        "npm run build && npm run start -- --hostname 127.0.0.1 --port 3411",
      url: baseURL,
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "/api/v1",
        API_PROXY_TARGET: api,
        API_SERVER_BASE_URL: `${api}/api/v1`,
        SITE_URL: baseURL,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
