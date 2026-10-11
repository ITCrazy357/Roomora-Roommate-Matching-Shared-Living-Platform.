"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { announcementText, type Announcement } from "@/lib/admin";

export function SystemBanner() {
  const [result, setResult] = useState<{
    items: Announcement[];
    offset: number;
  }>({ items: [], offset: 0 });
  const [clock, setClock] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      try {
        const started = Date.now();
        const data = await apiFetch<{
          items: Announcement[];
          serverTime: string;
        }>("/system/announcements", {
          credentials: "omit",
          signal: controller.signal,
          cache: "no-store",
        });
        const now = Date.now();
        setResult({
          items: data.items,
          offset: new Date(data.serverTime).getTime() - (started + now) / 2,
        });
        setClock(now);
      } catch {
        /* Keep an unexpired notice during a brief connection failure. */
      } finally {
        running = false;
      }
    }
    void refresh();
    const polling = setInterval(() => void refresh(), 20000);
    const tick = setInterval(() => setClock(Date.now()), 1000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("roomora:admin-change", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      clearInterval(polling);
      clearInterval(tick);
      window.removeEventListener("focus", focus);
      window.removeEventListener("roomora:admin-change", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  const items = result.items.filter(
    (item) => new Date(item.displayUntil).getTime() > clock + result.offset,
  );
  if (!items.length) return null;
  const content = items.map(announcementText).join("     •     ");
  return (
    <aside
      className={`system-banner${paused ? " is-paused" : ""}`}
      aria-label="Thông báo hệ thống"
    >
      <span className="system-banner-label">
        {items.some((item) => item.kind === "MAINTENANCE")
          ? "Lịch bảo trì"
          : "Thông báo"}
      </span>
      <div className="system-banner-window" tabIndex={0} aria-label={content}>
        <div
          className="system-banner-track"
          aria-hidden="true"
          style={{ animationDuration: `${Math.max(25, content.length / 6)}s` }}
        >
          <span>{content}</span>
          <span>{content}</span>
        </div>
        <span className="sr-only" role="status">
          {content}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setPaused((old) => !old)}
        aria-pressed={paused}
      >
        {paused ? "Chạy tiếp" : "Dừng chạy"}
      </button>
    </aside>
  );
}
