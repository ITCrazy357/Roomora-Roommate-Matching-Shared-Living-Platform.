"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "../auth-provider";
import { Button, ButtonLink, Card, ErrorState, Select, Textarea } from "../ui";
import { apiFetch } from "@/lib/api";
import {
  formatBudget,
  connectionLabels,
  matchLabels,
  peopleError,
  reportReasons,
  type Connection,
  type Person,
} from "@/lib/people";
import { lifestyleLabels } from "@/lib/profile";

const actionMessages = {
  send: "Đã gửi lời kết nối. Hãy chờ người nhận phản hồi.",
  accept: "Đã chấp nhận kết nối.",
  decline: "Đã từ chối lời kết nối.",
  cancel: "Đã hủy lời kết nối.",
};

export function PersonAvatar({
  person,
}: {
  person: Pick<Person, "displayName" | "avatarUrl">;
}) {
  return (
    <span className="person-avatar">
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatarUrl}
          alt={`Ảnh đại diện ${person.displayName}`}
        />
      ) : (
        <span aria-hidden="true">
          {person.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
export function ConnectionActions({
  person,
  onChange,
}: {
  person: Person;
  onChange: (message: string) => void;
}) {
  const { user } = useAuth();
  const [connection, setConnection] = useState(person.connection);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function handleAction(
    action: "send" | "accept" | "decline" | "cancel",
  ) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const saved = await apiFetch<Connection>(
        action === "send"
          ? "/connections"
          : `/connections/${connection?.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "send"
              ? { targetId: person.userId, message }
              : { version: connection?.version },
          ),
        },
      );
      setConnection(saved);
      onChange(actionMessages[action]);
    } catch (error) {
      setError(peopleError(error));
    } finally {
      setPending(false);
    }
  }
  if (!user)
    return <ButtonLink href="/dang-nhap">Đăng nhập để kết nối</ButtonLink>;
  if (user.id === person.userId)
    return (
      <ButtonLink href="/tai-khoan/ho-so" variant="secondary">
        Chỉnh sửa hồ sơ của tôi
      </ButtonLink>
    );
  const canSend =
    person.visibility === "PUBLIC" &&
    (!connection ||
      connection.status === "DECLINED" ||
      connection.status === "CANCELLED");
  return (
    <div className="person-actions">
      {error && <ErrorState message={error} />}
      {connection && (
        <p className="person-connection-state" role="status">
          {connectionLabels[connection.status]}
          {connection.status === "PENDING"
            ? connection.direction === "sent"
              ? " · Bạn đã gửi lời mời"
              : " · Bạn có lời mời mới"
            : ""}
        </p>
      )}
      {canSend && (
        <>
          <Textarea
            id={`connection-message-${person.userId}`}
            label="Lời nhắn kết nối (không bắt buộc)"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
            rows={3}
            disabled={pending}
          />
          <Button disabled={pending} onClick={() => handleAction("send")}>
            {pending ? "Đang gửi…" : "Gửi lời kết nối"}
          </Button>
        </>
      )}
      {connection?.status === "PENDING" && (
        <div className="people-action-row">
          {connection.direction === "received" ? (
            <>
              <Button disabled={pending} onClick={() => handleAction("accept")}>
                Chấp nhận kết nối
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => handleAction("decline")}
              >
                Từ chối
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => handleAction("cancel")}
            >
              Hủy lời mời
            </Button>
          )}
        </div>
      )}
      <Link href="/ket-noi" className="text-link">
        Quản lý yêu cầu kết nối →
      </Link>
    </div>
  );
}

function SafetyActions({
  person,
  onChange,
}: {
  person: Person;
  onChange: (message: string) => void;
}) {
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reported, setReported] = useState(false);
  async function block() {
    setPending(true);
    setError("");
    try {
      await apiFetch(`/user-safety/${person.userId}/block`, { method: "POST" });
      onChange(
        "Đã chặn người dùng. Bạn có thể bỏ chặn ở trang Yêu cầu kết nối.",
      );
    } catch (error) {
      setError(peopleError(error));
    } finally {
      setPending(false);
    }
  }
  async function report(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await apiFetch(`/user-safety/${person.userId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: form.get("reason"),
          details: form.get("details"),
        }),
      });
      setReported(true);
    } catch (error) {
      setError(peopleError(error));
    } finally {
      setPending(false);
    }
  }
  if (!user || user.id === person.userId) return null;
  return (
    <div className="people-safety">
      {error && <ErrorState message={error} />}
      {reported && (
        <p className="success-state" role="status">
          Đã tiếp nhận báo cáo của bạn.
        </p>
      )}
      <details>
        <summary>Báo cáo người dùng</summary>
        <form onSubmit={report} className="form-stack">
          <Select
            id={`report-reason-${person.userId}`}
            name="reason"
            label="Lý do báo cáo"
            disabled={pending || reported}
          >
            {Object.entries(reportReasons).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Textarea
            id={`report-details-${person.userId}`}
            name="details"
            label="Nội dung báo cáo"
            required
            minLength={10}
            maxLength={1000}
            rows={4}
            disabled={pending || reported}
            hint="Mô tả sự việc, từ 10 đến 1.000 ký tự. Không gửi thông tin nhạy cảm."
          />
          <Button
            variant="secondary"
            type="submit"
            disabled={pending || reported}
          >
            Gửi báo cáo
          </Button>
        </form>
      </details>
      <p className="text-muted text-sm">
        Chặn sẽ ẩn hồ sơ và hủy lời mời/kết nối giữa hai bạn. Có thể bỏ chặn
        sau.
      </p>
      <Button variant="secondary" disabled={pending} onClick={block}>
        Chặn người dùng
      </Button>
    </div>
  );
}

export function PersonDetails({
  person,
  onChange,
  publicPage = false,
}: {
  person: Person;
  onChange: (message: string) => void;
  publicPage?: boolean;
}) {
  const habits = [
    person.sleepSchedule,
    person.smokingPreference,
    person.petPreference,
    person.quietLevel,
  ].filter((value): value is string => Boolean(value));
  return (
    <Card className="person-details">
      <span className="eyebrow">
        {publicPage ? "HỒ SƠ ROOMORA" : "HỒ SƠ ĐỐI CHIẾU"}
      </span>
      <div className="person-identity">
        <PersonAvatar person={person} />
        <div>
          {publicPage ? (
            <h1>{person.displayName}</h1>
          ) : (
            <h2>{person.displayName}</h2>
          )}
          <p className="text-muted">
            {person.desiredAreas?.join(", ") || "Khu vực chưa công khai"}
          </p>
        </div>
      </div>
      <p className="person-bio">
        {person.bio || "Chưa bổ sung lời giới thiệu."}
      </p>
      <p>
        <strong>Ngân sách:</strong> {formatBudget(person)}
      </p>
      <div className="people-tags">
        {habits.map((value) => (
          <span key={value}>{lifestyleLabels[value]}</span>
        ))}
      </div>
      {person.match && (
        <section className="person-match">
          <div className="person-match-heading">
            <h3>Đối chiếu nếp sống</h3>
            <strong>
              {person.match.score === null
                ? "Chưa đủ dữ liệu"
                : `${person.match.score}% phù hợp`}
            </strong>
          </div>
          <p className="text-muted text-sm">
            {person.match.assessed}/{person.match.total} tiêu chí có dữ liệu để
            đối chiếu.
          </p>
          <ul>
            {person.match.reasons.map((reason) => (
              <li
                key={reason.key}
                className={`match-${reason.result.toLowerCase()}`}
              >
                <div>
                  <strong>{reason.label}</strong>
                  <span>{matchLabels[reason.result]}</span>
                </div>
                <p>{reason.explanation}</p>
              </li>
            ))}
          </ul>
          <details>
            <summary>Cách tính mức độ phù hợp</summary>
            <p className="text-muted text-sm">
              Khu vực 25%, ngân sách 25%, giờ ngủ 15%, hút thuốc 15%, thú cưng
              10%, mức độ yên tĩnh 10%. Phù hợp tính đủ điểm, cần trao đổi tính
              nửa điểm, khác biệt không có điểm. Chỉ tính trên tiêu chí có dữ
              liệu; cần ít nhất 2 tiêu chí để hiển thị %. Thông tin tự khai
              không thay thế việc trao đổi trực tiếp.
            </p>
          </details>
        </section>
      )}
      <ConnectionActions person={person} onChange={onChange} />
      {!publicPage && (
        <Link href={`/ho-so/${person.userId}`} className="text-link">
          Mở hồ sơ công khai ↗
        </Link>
      )}
      <SafetyActions person={person} onChange={onChange} />
    </Card>
  );
}
