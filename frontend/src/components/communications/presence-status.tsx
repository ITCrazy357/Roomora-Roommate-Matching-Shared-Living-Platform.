"use client";
import { presenceStatus, type Presence } from "@/lib/presence";
import { useUpdates } from "./updates-provider";

export function PresenceStatus({
  presence,
  compact = false,
}: {
  presence?: Presence;
  compact?: boolean;
}) {
  const { now, connected } = useUpdates();
  const status = presenceStatus(presence, now);
  // During a disconnected stream, avoid promising that the peer is still online.
  const online = connected && status.online;
  const label =
    status.online && !connected ? "Đang cập nhật trạng thái…" : status.label;
  if (compact)
    return online ? (
      <span
        className="presence-dot presence-avatar-dot"
        role="img"
        aria-label={label}
        title={label}
      />
    ) : null;
  return (
    <span className={`presence-status${online ? " presence-online" : ""}`}>
      {online && <span className="presence-dot" aria-hidden="true" />}
      {label}
    </span>
  );
}
