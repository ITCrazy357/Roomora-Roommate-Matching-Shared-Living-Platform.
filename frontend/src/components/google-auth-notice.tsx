"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { authCodeMessage } from "@/lib/auth-errors";
import { ErrorState } from "./ui";

function GoogleResult() {
  const result = useSearchParams().get("google");
  if (!result) return null;
  if (result === "linked") {
    return (
      <div className="success-state" role="status">
        Đã liên kết Google. Lần sau bạn có thể đăng nhập bằng Google hoặc mật
        khẩu.
      </div>
    );
  }
  return <ErrorState message={authCodeMessage(result)} />;
}

export function GoogleAuthNotice() {
  return (
    <Suspense fallback={null}>
      <GoogleResult />
    </Suspense>
  );
}
