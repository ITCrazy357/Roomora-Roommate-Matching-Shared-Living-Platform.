"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../auth-provider";
import { Badge, Button, Card, ErrorState } from "../ui";
import { AppointmentForm } from "./appointment-form";
import {
  appointmentLabels,
  communicationError,
  formatTime,
  post,
  type Appointment,
} from "@/lib/communications";

function downloadCalendar(item: Appointment) {
  const escape = (text: string) =>
    text
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const date = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roomora//Viewing//VI",
    "BEGIN:VEVENT",
    `UID:${item.id}@roomora`,
    `DTSTAMP:${date(new Date().toISOString())}`,
    `DTSTART:${date(item.startsAt)}`,
    `DTEND:${date(new Date(new Date(item.startsAt).getTime() + 3600000).toISOString())}`,
    `SUMMARY:${escape(item.listing ? "Xem phòng: " + item.listing.title : "Gặp mặt qua Roomora")}`,
    `LOCATION:${escape(item.place)}`,
    `DESCRIPTION:${escape(item.note)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join("\r\n") + "\r\n"], {
      type: "text/calendar;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "roomora-lich-hen.ics";
  link.click();
  URL.revokeObjectURL(url);
}
export function AppointmentCard({
  item,
  onChange,
}: {
  item: Appointment;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function action(action: "confirm" | "cancel") {
    setPending(true);
    setError("");
    try {
      await post(
        `/conversations/${item.conversationId}/appointments/${item.id}`,
        { action, version: item.version },
      );
      onChange();
    } catch (error) {
      setError(communicationError(error));
      onChange();
    } finally {
      setPending(false);
    }
  }
  const upcoming = item.upcoming;
  return (
    <Card className="appointment-card">
      <div className="communication-actions">
        <Badge>{appointmentLabels[item.status]}</Badge>
        {item.person && (
          <span className="text-muted">{item.person.displayName}</span>
        )}
      </div>
      <h3>{formatTime(item.startsAt)}</h3>
      {item.listingId && item.listing ? (
        <Link className="text-link" href={`/phong/${item.listingId}`}>
          {item.listing.title}
        </Link>
      ) : (
        <p className="text-muted">Hẹn gặp để trao đổi</p>
      )}
      <p className="appointment-place">⌖ {item.place}</p>
      {item.note && <p className="appointment-note">{item.note}</p>}
      {error && <ErrorState message={error} />}
      {editing ? (
        <AppointmentForm
          conversationId={item.conversationId}
          rooms={[]}
          appointment={item}
          onDone={() => {
            setEditing(false);
            onChange();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="communication-actions">
          {item.status === "PENDING" &&
            upcoming &&
            item.proposerId !== user?.id && (
              <Button disabled={pending} onClick={() => action("confirm")}>
                Xác nhận lịch
              </Button>
            )}
          {item.status !== "CANCELLED" && upcoming && (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setEditing(true)}
              >
                Đổi lịch hẹn
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => action("cancel")}
              >
                Hủy lịch hẹn
              </Button>
            </>
          )}
          {item.status === "CONFIRMED" && (
            <Button variant="secondary" onClick={() => downloadCalendar(item)}>
              Thêm vào lịch cá nhân
            </Button>
          )}
          <Link className="text-link" href={`/tin-nhan/${item.conversationId}`}>
            Mở hội thoại →
          </Link>
        </div>
      )}
      <details className="appointment-history">
        <summary>Lịch sử đề xuất và phản hồi ({item.changes.length})</summary>
        <ol>
          {item.changes.map((change) => (
            <li key={change.version}>
              <strong>
                {change.actorId === user?.id ? "Bạn" : "Người cùng hẹn"} ·{" "}
                {appointmentLabels[change.status]}
              </strong>
              <small>{formatTime(change.createdAt)}</small>
              <p>
                {formatTime(change.startsAt)} · {change.place}
              </p>
              {change.note && <p>{change.note}</p>}
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
