"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch } from "@/lib/api";
import { expenseError } from "@/lib/expenses";
import { houseDate } from "@/lib/houses";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";
import { HouseFinances } from "./house-finances";
export function FinancePage({ houseId }: { houseId?: string }) {
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
          title="Đăng nhập để xem công nợ"
          action={<ButtonLink href="/dang-nhap">Đăng nhập</ButtonLink>}
        >
          <p>Chỉ người đã tham gia nhà được xem các khoản liên quan.</p>
        </EmptyState>
      </section>
    );
  return houseId ? (
    <FinanceHouse
      key={`${user.id}:${houseId}`}
      houseId={houseId}
      userId={user.id}
    />
  ) : (
    <FinanceHistory key={user.id} />
  );
}
function FinanceHouse({
  houseId,
  userId,
}: {
  houseId: string;
  userId: string;
}) {
  const [mode, setMode] = useState<"expenses" | "balances">("balances");
  return (
    <section className="container page-section houses-page">
      <Link className="text-link" href="/nha-chung/lich-su">
        ← Lịch sử nhà đã ở
      </Link>
      <nav className="house-tabs" aria-label="Sổ chi phí">
        <Button
          variant={mode === "expenses" ? "primary" : "secondary"}
          onClick={() => setMode("expenses")}
        >
          Khoản chi
        </Button>
        <Button
          variant={mode === "balances" ? "primary" : "secondary"}
          onClick={() => setMode("balances")}
        >
          Công nợ & Quyết toán
        </Button>
      </nav>
      <HouseFinances key={mode} houseId={houseId} userId={userId} mode={mode} />
    </section>
  );
}
function FinanceHistory() {
  const [houses, setHouses] = useState<
    | {
        id: string;
        name: string;
        closedAt: string | null;
        members: { leftAt: string | null }[];
      }[]
    | null
  >(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<NonNullable<typeof houses>>("/expenses/houses", {
      signal: controller.signal,
    })
      .then((rows) => {
        setHouses(rows);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(expenseError(error));
      });
    return () => controller.abort();
  }, [refresh]);
  return (
    <section className="container page-section houses-page">
      <Link className="text-link" href="/nha-chung">
        ← Nhà chung hiện tại
      </Link>
      <div className="house-heading">
        <h1>Lịch sử công nợ</h1>
        <p className="text-muted">
          Công nợ cũ vẫn được giữ khi bạn chuyển sang nhà khác.
        </p>
      </div>
      {error && (
        <ErrorState
          message={error}
          action={
            <Button onClick={() => setRefresh((value) => value + 1)}>
              Thử lại
            </Button>
          }
        />
      )}
      {!houses && !error && <LoadingState />}
      {houses?.length === 0 && (
        <Card className="house-panel">
          <p>Chưa có nhà chung trong lịch sử của bạn.</p>
        </Card>
      )}
      {houses?.map((house) => (
        <Card className="house-panel" key={house.id}>
          <h2>{house.name}</h2>
          <p className="text-muted">
            {house.members[0].leftAt
              ? `Đã rời ngày ${houseDate(house.members[0].leftAt)}`
              : house.closedAt
                ? "Nhà đã lưu trữ"
                : "Đang tham gia"}
          </p>
          <ButtonLink
            href={`/nha-chung/${house.id}/chi-phi`}
            variant="secondary"
          >
            Xem khoản chi & Công nợ
          </ButtonLink>
        </Card>
      ))}
    </section>
  );
}
