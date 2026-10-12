"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

export function RefundProof({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    fetch(apiUrl(path), {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("Content-Type")?.startsWith("image/")
        )
          throw new Error();
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Không tải được chứng từ. Kiểm tra quyền truy cập và thử lại.",
          );
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return error ? (
    <p role="alert">{error}</p>
  ) : url ? (
    <Image
      className="refund-proof-image"
      src={url}
      width={1600}
      height={1200}
      unoptimized
      alt="Chứng từ chuyển khoản hoàn tiền, chỉ chủ giao dịch và ADMIN được xem"
    />
  ) : (
    <p role="status">Đang tải chứng từ riêng tư…</p>
  );
}
