export interface Presence {
  online: boolean;
  lastActiveAt: string | null;
}

export const PRESENCE_IDLE_MS = 3 * 60 * 1000;

export function presenceStatus(presence: Presence | undefined, now: number) {
  const timestamp = presence?.lastActiveAt
    ? Date.parse(presence.lastActiveAt)
    : NaN;
  if (!Number.isFinite(timestamp))
    return { online: false, label: "Chưa có thông tin hoạt động" };
  const elapsed = Math.max(0, now - timestamp);
  const online = !!presence?.online && elapsed < PRESENCE_IDLE_MS;
  if (online) return { online: true, label: "Đang hoạt động" };
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return { online: false, label: "Vừa hoạt động" };
  if (minutes < 60)
    return { online: false, label: `Hoạt động ${minutes} phút trước` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return { online: false, label: `Hoạt động ${hours} giờ trước` };
  return {
    online: false,
    label: `Hoạt động ${Math.floor(hours / 24)} ngày trước`,
  };
}
