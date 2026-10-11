"use client";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { PRESENCE_IDLE_MS } from "@/lib/presence";

export function useActivityHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let lastActivity = 0;
    let recordedActivity = 0;
    let lastSent = 0;
    let running = false;

    async function flush() {
      const now = Date.now();
      if (
        document.visibilityState !== "visible" ||
        running ||
        lastActivity <= recordedActivity ||
        now - lastSent < 30000 ||
        now - lastActivity >= PRESENCE_IDLE_MS
      )
        return;
      const activity = lastActivity;
      running = true;
      lastSent = now;
      try {
        await apiFetch("/presence/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idleSeconds: Math.floor((now - activity) / 1000),
          }),
          signal: controller.signal,
        });
        recordedActivity = activity;
      } catch {
        // A later interaction/tick retries; polling itself never counts as activity.
      } finally {
        running = false;
      }
    }
    function activity() {
      if (document.visibilityState !== "visible") return;
      lastActivity = Date.now();
      void flush();
    }
    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "touchstart",
      "touchmove",
    ] as const;
    events.forEach((event) =>
      window.addEventListener(event, activity, {
        passive: true,
        capture: true,
      }),
    );
    window.addEventListener("focus", activity);
    document.addEventListener("visibilitychange", activity);
    const timer = setInterval(() => void flush(), 30000);
    activity();
    return () => {
      controller.abort();
      clearInterval(timer);
      events.forEach((event) =>
        window.removeEventListener(event, activity, true),
      );
      window.removeEventListener("focus", activity);
      document.removeEventListener("visibilitychange", activity);
    };
  }, [userId]);
}
