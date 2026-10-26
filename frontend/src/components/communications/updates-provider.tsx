"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch, apiUrl } from "@/lib/api";
import { useActivityHeartbeat } from "./use-activity-heartbeat";

const UpdatesContext = createContext({
  now: 0,
  revision: 0,
  connected: false,
  messages: 0,
  notifications: 0,
  typingByConversation: {} as Record<string, boolean>,
});
export function UpdatesProvider({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuth();
  const authenticatedUserId = user?.id;
  const isAdmin = user?.role === "ADMIN";
  useActivityHeartbeat(user?.role === "USER" ? user.id : undefined);
  const [state, setState] = useState({
    now: 0,
    userId: "",
    revision: 0,
    connected: false,
    messages: 0,
    notifications: 0,
    typingByConversation: {} as Record<string, boolean>,
  });
  useEffect(() => {
    if (!authenticatedUserId) return;
    const userId = authenticatedUserId;
    const controller = new AbortController();
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const clock = setInterval(() => {
      if (document.visibilityState === "visible")
        setState((old) => ({ ...old, now: Date.now() }));
    }, 15000);
    function setTyping(id: string, typing: boolean) {
      setState((old) => {
        const next = { ...old.typingByConversation };
        if (typing) next[id] = true;
        else delete next[id];
        return { ...old, typingByConversation: next };
      });
    }
    let running = false;
    let pending = false;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    async function sync() {
      if (document.visibilityState !== "visible") {
        pending = true;
        return;
      }
      if (isAdmin) {
        setState((old) => ({
          ...old,
          userId,
          revision: old.revision + 1,
          messages: 0,
          notifications: 0,
        }));
        return;
      }
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        do {
          pending = false;
          // A sync also refreshes support/profile screens if unread counters fail.
          if (!controller.signal.aborted)
            setState((old) => ({ ...old, userId, revision: old.revision + 1 }));
          const counts = await apiFetch<{
            messages: number;
            notifications: number;
          }>("/updates/unread", { signal: controller.signal });
          if (!controller.signal.aborted)
            setState((old) => ({
              ...old,
              userId,
              messages: counts.messages,
              notifications: counts.notifications,
            }));
        } while (
          pending &&
          !controller.signal.aborted &&
          document.visibilityState === "visible"
        );
      } catch {
        /* Stream reconnect or focus will retry. */
      } finally {
        running = false;
      }
    }
    function scheduleSync() {
      if (document.visibilityState !== "visible") {
        pending = true;
        return;
      }
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = undefined;
        void sync();
      }, 150);
    }
    const stream = new EventSource(apiUrl("/updates"), {
      withCredentials: true,
    });
    stream.onopen = () => {
      setState((old) => ({
        ...old,
        userId,
        now: Date.now(),
        connected: true,
        messages: old.userId === userId ? old.messages : 0,
        notifications: old.userId === userId ? old.notifications : 0,
        typingByConversation: {},
      }));
      scheduleSync();
    };
    stream.onerror = () => setState((old) => ({ ...old, connected: false }));
    stream.addEventListener("sync", () => {
      scheduleSync();
    });
    stream.addEventListener("typing", (event) => {
      try {
        const signal = JSON.parse(event.data) as {
          conversationId?: unknown;
          typing?: unknown;
        };
        if (
          typeof signal.conversationId !== "string" ||
          typeof signal.typing !== "boolean"
        )
          return;
        const id = signal.conversationId;
        const typing = signal.typing;
        clearTimeout(typingTimers.get(id));
        typingTimers.delete(id);
        setTyping(id, typing);
        if (typing)
          typingTimers.set(
            id,
            setTimeout(() => {
              setTyping(id, false);
              typingTimers.delete(id);
            }, 4000),
          );
      } catch {
        /* Ignore malformed transient signals. */
      }
    });
    stream.addEventListener("expired", () => {
      stream.close();
      setUser(null);
      setState((old) => ({ ...old, connected: false }));
    });
    const focus = () => {
      if (document.visibilityState === "visible") scheduleSync();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      clearInterval(clock);
      clearTimeout(scheduled);
      typingTimers.forEach(clearTimeout);
      stream.close();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [authenticatedUserId, isAdmin, setUser]);
  const value =
    user && user.id === state.userId
      ? state
      : {
          now: 0,
          revision: 0,
          connected: false,
          messages: 0,
          notifications: 0,
          typingByConversation: {},
        };
  return (
    <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>
  );
}
export function useUpdates() {
  return useContext(UpdatesContext);
}
