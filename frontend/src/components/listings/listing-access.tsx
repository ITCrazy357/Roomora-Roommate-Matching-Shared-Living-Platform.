"use client";

import { useAuth } from "../auth-provider";
import { Fragment } from "react";
import { ButtonLink, EmptyState, LoadingState } from "../ui";

export function ListingAccess({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
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
          title="Đăng nhập để tiếp tục"
          action={<ButtonLink href="/dang-nhap">Đăng nhập</ButtonLink>}
        >
          <p>Đăng nhập để quản lý và lưu những tin phòng bạn quan tâm.</p>
        </EmptyState>
      </section>
    );
  if (admin && user.role !== "ADMIN")
    return (
      <section className="container page-section narrow">
        <EmptyState title="Khu vực quản trị">
          <p>Chỉ quản trị viên được kiểm duyệt tin đăng.</p>
        </EmptyState>
      </section>
    );
  return <Fragment key={user.id}>{children}</Fragment>;
}
