"use client";
import { Fragment } from "react";
import { useAuth } from "../auth-provider";
import { ButtonLink, EmptyState, LoadingState } from "../ui";

export function ServiceAccess({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="container page-section">
        <LoadingState />
      </div>
    );
  if (!user)
    return (
      <section className="container page-section narrow">
        <EmptyState
          title="Đăng nhập để quản lý dịch vụ"
          action={<ButtonLink href="/dang-nhap">Đăng nhập</ButtonLink>}
        >
          <p>Xem gói đẩy tin, quyền lợi và lịch sử thanh toán của bạn.</p>
        </EmptyState>
      </section>
    );
  if (user.role === "ADMIN")
    return (
      <section className="container page-section">
        <ButtonLink href="/admin">Về khu vực quản trị</ButtonLink>
      </section>
    );
  return <Fragment key={user.id}>{children}</Fragment>;
}
