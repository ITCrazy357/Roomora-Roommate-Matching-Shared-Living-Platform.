"use client";

import { useEffect, useRef } from "react";
import { post } from "@/lib/communications";

export function useTyping(conversationId: string) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);

  function send(typing: boolean) {
    // Typing is temporary: a failed update must not interrupt the message draft.
    void post(`/conversations/${conversationId}/typing`, { typing }).catch(
      () => {},
    );
  }

  function stopTyping() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    idleTimer.current = null;
    refreshTimer.current = null;
    if (active.current) send(false);
    active.current = false;
  }

  function updateTyping(text: string) {
    if (!text.trim()) {
      stopTyping();
      return;
    }
    if (!active.current) {
      active.current = true;
      send(true);
      refreshTimer.current = setInterval(() => send(true), 2000);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stopTyping, 1800);
  }

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      if (active.current) {
        void post(`/conversations/${conversationId}/typing`, {
          typing: false,
        }).catch(() => {});
      }
      active.current = false;
    },
    [conversationId],
  );

  return { updateTyping, stopTyping };
}
