"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ListingQuota as Quota } from "@/lib/listings";
import { Button, ButtonLink, Card } from "../ui";

const date = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export function ListingQuota({ revision }: { revision?: number }) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      apiFetch<Quota>("/listings/quota", { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) {
            setQuota(value);
            setError(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    // Refresh when the account benefit expires or the new week starts.
    const timer = setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [revision, retry]);

  return (
    <Card>
      <h3>Lượt đăng tin trong tuần</h3>
      <div aria-live="polite">
        {error ? (
          <>
            <p className="text-muted">Chưa tải được hạn mức hiện tại.</p>
            <Button
              variant="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Tải lại hạn mức
            </Button>
          </>
        ) : quota ? (
          <>
            <p>
              Đã dùng{" "}
              <strong>
                {quota.used}/{quota.limit}
              </strong>{" "}
              · Còn {quota.remaining} lượt
            </p>
            <p className="text-muted text-sm">
              Tuần mới bắt đầu lúc {date(quota.resetsAt)} (giờ Việt Nam).
            </p>
            {quota.bonusUntil && (
              <p className="text-muted text-sm">
                Thêm 5 lượt/tuần đến {date(quota.bonusUntil)}. Nhiều gói không
                cộng dồn hạn mức.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted">Đang tải hạn mức…</p>
        )}
      </div>
      <p className="text-muted text-sm">
        Tính chung tin tìm phòng và tìm ở ghép khi gửi duyệt lần đầu. Lưu nháp
        và gửi duyệt lại cùng tin không tốn thêm lượt.
      </p>
      <ButtonLink href="/dich-vu" variant="secondary">
        Xem gói đẩy tin
      </ButtonLink>
    </Card>
  );
}
