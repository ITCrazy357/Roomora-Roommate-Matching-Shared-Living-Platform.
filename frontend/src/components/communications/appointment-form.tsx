"use client";
import { useState } from "react";
import { Button, ErrorState, Input, Select, Textarea } from "../ui";
import {
  communicationError,
  post,
  type Appointment,
  type Room,
} from "@/lib/communications";

function inputTime(value: string) {
  // datetime-local is always displayed and submitted in Vietnam time.
  return new Date(new Date(value).getTime() + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function AppointmentForm({
  conversationId,
  rooms,
  appointment,
  onDone,
  onCancel,
}: {
  conversationId: string;
  rooms: Room[];
  appointment?: Appointment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const body = {
        startsAt: new Date(`${values.get("startsAt")}:00+07:00`).toISOString(),
        place: values.get("place"),
        note: values.get("note"),
      };
      if (appointment)
        await post(
          `/conversations/${conversationId}/appointments/${appointment.id}`,
          { ...body, action: "reschedule", version: appointment.version },
        );
      else
        await post(`/conversations/${conversationId}/appointments`, {
          ...body,
          ...(values.get("listingId") ? { listingId: values.get("listingId") } : {}),
        });
      onDone();
    } catch (error) {
      setError(communicationError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="appointment-form form-stack" onSubmit={submit}>
      <h3>{appointment ? "Đề xuất đổi lịch" : "Đề xuất lịch hẹn"}</h3>
      {error && <ErrorState message={error} />}
      {!appointment && rooms.length > 0 && (
        <Select
          id="appointment-room"
          name="listingId"
          label="Tin phòng (không bắt buộc)"
          disabled={pending}
        >
          <option value="">Hẹn gặp để trao đổi</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.title}
            </option>
          ))}
        </Select>
      )}
      {!appointment && !rooms.length && (
        <p className="text-muted text-sm">Hai bạn có thể hẹn gặp để trao đổi. Khi có tin phòng công khai, bạn có thể chọn tin đó để hẹn xem phòng.</p>
      )}
      <Input
        id="appointment-time"
        name="startsAt"
        type="datetime-local"
        label="Thời gian (giờ Việt Nam)"
        defaultValue={appointment ? inputTime(appointment.startsAt) : ""}
        required
        disabled={pending}
      />
      <Input
        id="appointment-place"
        name="place"
        label="Địa điểm gặp"
        defaultValue={appointment?.place ?? ""}
        placeholder="Ví dụ: sảnh chung cư, cổng nhà"
        minLength={3}
        maxLength={300}
        required
        disabled={pending}
      />
      <Textarea
        id="appointment-note"
        name="note"
        label="Ghi chú cho hai người"
        defaultValue={appointment?.note ?? ""}
        rows={3}
        maxLength={1000}
        disabled={pending}
      />
      <p className="text-muted text-sm">
        Địa điểm và ghi chú chỉ hiển thị cho hai người trong hội thoại. Bên kia
        cần xác nhận mỗi đề xuất mới.
      </p>
      <div className="communication-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang gửi…" : "Gửi đề xuất"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Đóng
        </Button>
      </div>
    </form>
  );
}
