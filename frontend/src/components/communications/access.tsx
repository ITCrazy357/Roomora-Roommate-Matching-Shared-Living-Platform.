"use client";
import { Fragment } from "react";
import { useAuth } from "../auth-provider";
import { ButtonLink, EmptyState, LoadingState } from "../ui";
export function CommunicationAccess({
  children,
}: {
  children: React.ReactNode;
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
          <p>Đăng nhập để nhắn tin, hẹn xem phòng và xem thông báo của bạn.</p>
        </EmptyState>
      </section>
    );
  return <Fragment key={user.id}>{children}</Fragment>;
}
