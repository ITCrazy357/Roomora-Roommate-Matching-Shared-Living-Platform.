"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  communicationError,
  appointmentLabels,
  formatTime,
  type Appointment,
  type Page,
} from "@/lib/communications";
import {
  Button,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../ui";
import { useUpdates } from "./updates-provider";
import { CommunicationAccess } from "./access";
import { AppointmentCard } from "./appointment-card";
import { Pagination } from "./pagination";

export function Appointments() {
  return (
    <CommunicationAccess>
      <AppointmentsContent />
    </CommunicationAccess>
  );
}
function AppointmentsContent() {
  const { revision } = useUpdates();
  const [data, setData] = useState<Page<Appointment> | null>(null);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Page<Appointment>>(`/appointments?page=${page}&tab=${tab}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setData(data);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(communicationError(error));
        }
      });
    return () => controller.abort();
  }, [revision, page, tab, refresh]);
  const items = data?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  return (
    <section className="container communication-section">
      <div className="communication-title">
        <div>
          <span className="eyebrow">Không gian gặp gỡ văn minh</span>
          <h1>Lịch hẹn của bạn.</h1>
          <p className="text-muted">
            Thống nhất thời gian gặp, trao đổi và xem phòng khi hai bạn sẵn sàng.
          </p>
        </div>
        <ButtonLink href="/tin-nhan">＋ Đề xuất từ hội thoại</ButtonLink>
      </div>
      <Card className="viewing-safety">
        <strong>Lịch hẹn không phải là đặt cọc giữ chỗ.</strong>
        <p>
          Hẹn tại nơi dễ tìm, nên đi vào ban ngày hoặc cùng bạn bè. Chỉ chia sẻ
          địa điểm riêng với người cùng hẹn.
        </p>
      </Card>
      <div className="communication-tabs" aria-label="Lọc lịch hẹn">
        {[
          ["all", "Tất cả"],
          ["upcoming", "Sắp tới"],
          ["pending", "Chờ phản hồi"],
          ["past", "Đã kết thúc"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => {
              setData(null);
              setPage(1);
              setTab(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <ErrorState
          message={error}
          action={
            <Button onClick={() => setRefresh((value) => value + 1)}>
              Làm mới
            </Button>
          }
        />
      )}
      {!data && !error && <LoadingState />}
      {data && !items.length && (
        <EmptyState title="Chưa có lịch hẹn trong mục này">
          <p>Mở hội thoại để đề xuất lịch gặp, hoặc chọn tin phòng để hẹn xem.</p>
        </EmptyState>
      )}
      <div className="appointments-grid">
        <div className="appointment-list">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`appointment-summary ${selected?.id === item.id ? "appointment-selected" : ""}`}
            >
              <Badge>{appointmentLabels[item.status]}</Badge>
              <h2>{formatTime(item.startsAt)}</h2>
              <p>{item.listing?.title ?? "Hẹn gặp để trao đổi"}</p>
              <p className="text-muted">
                {item.person?.displayName} · {item.place}
              </p>
              <div className="communication-actions">
                <Button
                  variant="secondary"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  Xem chi tiết →
                </Button>
                <Link
                  className="text-link"
                  href={`/tin-nhan/${item.conversationId}`}
                >
                  Mở hội thoại
                </Link>
              </div>
            </Card>
          ))}
        </div>
        {selected && (
          <aside className="appointment-detail">
            <h2>Chi tiết lịch hẹn</h2>
            <AppointmentCard
              key={selected.id}
              item={selected}
              onChange={() => setRefresh((value) => value + 1)}
            />
          </aside>
        )}
      </div>
      {data && (
        <Pagination
          page={page}
          pages={data.pages}
          onChange={(value) => {
            setData(null);
            setPage(value);
          }}
        />
      )}
    </section>
  );
}
