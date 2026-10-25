"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorState, LoadingState } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type Connection = {
  id: string;
  clientName: string;
  createdAt: string;
  expiresAt: string;
};

export function McpConnectionsCard() {
  const [items, setItems] = useState<Connection[]>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Connection[]>("/mcp/connections", { signal: controller.signal })
      .then(setItems)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Chưa tải được ứng dụng đã kết nối. Hãy tải lại trang.");
      });
    return () => controller.abort();
  }, []);
  async function disconnect(id: string) {
    setPending(id);
    setError("");
    try {
      await apiFetch(`/mcp/connections/${id}`, { method: "DELETE" });
      setItems((items) => items?.filter((item) => item.id !== id));
    } catch {
      setError("Chưa thu hồi được quyền. Hãy thử lại.");
    } finally {
      setPending(undefined);
    }
  }
  return (
    <Card className="settings-card">
      <h2>Ứng dụng AI đã kết nối</h2>
      <p className="text-muted">
        Các ứng dụng này chỉ được tra cứu tin công khai. Thu hồi sẽ vô hiệu hóa
        cả quyền truy cập và gia hạn.
      </p>
      {!items && !error && <LoadingState message="Đang tải kết nối…" />}
      {items?.length === 0 && <p>Chưa có ứng dụng nào được cấp quyền.</p>}
      <div className="session-list">
        {items?.map((item) => (
          <article className="session-item" key={item.id}>
            <div>
              <strong>{item.clientName}</strong>
              <p className="text-muted text-sm">
                Cấp ngày {new Date(item.createdAt).toLocaleDateString("vi-VN")}{" "}
                · Hết hạn {new Date(item.expiresAt).toLocaleDateString("vi-VN")}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={!!pending}
              onClick={() => void disconnect(item.id)}
            >
              {pending === item.id ? "Đang thu hồi…" : "Thu hồi"}
            </Button>
          </article>
        ))}
      </div>
      {error && <ErrorState message={error} />}
    </Card>
  );
}
