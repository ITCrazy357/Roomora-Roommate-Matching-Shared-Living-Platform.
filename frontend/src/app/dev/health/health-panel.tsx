"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ErrorState, LoadingState } from "@/components/ui";

type Health = {
  status: string;
  service: string;
  database?: string;
  timestamp: string;
};
type Result =
  | { kind: "loading" }
  | { kind: "success"; checkedAt: string }
  | { kind: "error"; message: string };

export function HealthPanel() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      try {
        const [health, ready] = await Promise.all([
          apiFetch<Health>("/health", {
            signal: controller.signal,
            cache: "no-store",
          }),
          apiFetch<Health>("/health/ready", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);
        if (
          health.status !== "ok" ||
          ready.status !== "ok" ||
          ready.database !== "up"
        ) {
          throw new Error("Backend chưa sẵn sàng.");
        }
        if (!controller.signal.aborted)
          setResult({
            kind: "success",
            checkedAt: new Date().toLocaleTimeString("vi-VN"),
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Không thể kiểm tra kết nối.",
          });
      }
    }
    void check();
    return () => controller.abort();
  }, [attempt]);

  return (
    <section className="container page-section narrow">
      <Card className="health-panel">
        <Badge>Chỉ dành cho development</Badge>
        <h1>Kiểm tra kết nối API</h1>
        <p className="text-muted">
          Hai request được gửi trực tiếp từ trình duyệt tới backend, bao gồm
          kiểm tra database.
        </p>
        <code className="api-address">
          {process.env.NEXT_PUBLIC_API_BASE_URL}
        </code>
        {result.kind === "loading" && (
          <LoadingState message="Đang kiểm tra API và database…" />
        )}
        {result.kind === "success" && (
          <div className="success-state" role="status">
            <strong>Kết nối thành công</strong>
            <p>
              Health và readiness đều hoạt động. Kiểm tra lúc {result.checkedAt}
              .
            </p>
          </div>
        )}
        {result.kind === "error" && <ErrorState message={result.message} />}
        <Button
          disabled={result.kind === "loading"}
          onClick={() => {
            setResult({ kind: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Thử lại
        </Button>
      </Card>
    </section>
  );
}
