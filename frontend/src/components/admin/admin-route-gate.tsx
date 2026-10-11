"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../auth-provider";
import { LoadingState } from "../ui";

export function AdminRouteGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const redirect = user?.role === "ADMIN" && !path.startsWith("/admin/");
  useEffect(() => {
    if (redirect)
      router.replace(
        path === "/tai-khoan/cai-dat"
          ? `/admin/tai-khoan${window.location.search}`
          : "/admin/tin-dang",
      );
  }, [redirect, path, router]);
  if (redirect)
    return (
      <div className="container page-section">
        <LoadingState />
      </div>
    );
  return children;
}
