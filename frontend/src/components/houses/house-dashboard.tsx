"use client";
import { useAuth } from "../auth-provider";
import { ButtonLink, EmptyState, LoadingState } from "../ui";
import { HouseList } from "./house-list";
import { HouseDetail } from "./house-detail";
import type { HouseholdMode } from "./household-panel";

export function HouseDashboard({
  id,
  initialTab,
}: {
  id?: string;
  initialTab?: HouseholdMode | "sharing";
}) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <section className="container page-section">
        <LoadingState />
      </section>
    );
  if (!user)
    return (
      <section className="container page-section narrow">
        <EmptyState
          title="Đăng nhập để quản lý nhà chung"
          action={<ButtonLink href="/dang-nhap">Đăng nhập</ButtonLink>}
        >
          <p>Thành viên của một nhà mới xem được thông tin nội bộ.</p>
        </EmptyState>
      </section>
    );
  return id ? (
    <HouseDetail
      key={`${id}:${user.id}`}
      id={id}
      userId={user.id}
      initialTab={initialTab}
    />
  ) : (
    <HouseList key={user.id} />
  );
}
