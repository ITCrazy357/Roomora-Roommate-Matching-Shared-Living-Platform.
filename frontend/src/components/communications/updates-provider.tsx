"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch, apiUrl } from "@/lib/api";
import type { Page, Conversation, Notice } from "@/lib/communications";

const UpdatesContext = createContext({
  revision: 0,
  connected: false,
  messages: 0,
  notifications: 0,
  typingByConversation: {} as Record<string, boolean>,
});
export function UpdatesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    userId: "",
    revision: 0,
    connected: false,
    messages: 0,
    notifications: 0,
    typingByConversation: {} as Record<string, boolean>,
  });
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const controller = new AbortController();
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    async function sync() {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        do {
          pending = false;
          const [messages, notices] = await Promise.all([
            apiFetch<Page<Conversation>>("/conversations?limit=1", {
              signal: controller.signal,
            }),
            apiFetch<Page<Notice>>("/notifications?limit=1", {
              signal: controller.signal,
            }),
          ]);
          if (!controller.signal.aborted)
            setState((old) => ({
              ...old,
              userId,
              revision: old.revision + 1,
              messages: messages.unread ?? 0,
              notifications: notices.unread ?? 0,
            }));
        } while (pending && !controller.signal.aborted);
      } catch {
        /* Stream reconnect or focus will retry. */
      } finally {
        running = false;
      }
    }
    const stream = new EventSource(apiUrl("/updates"), {
      withCredentials: true,
    });
    stream.onopen = () => {
      setState((old) => ({
        ...old,
        userId,
        connected: true,
        messages: old.userId === userId ? old.messages : 0,
        notifications: old.userId === userId ? old.notifications : 0,
        typingByConversation: {},
      }));
      void sync();
    };
    stream.onerror = () => setState((old) => ({ ...old, connected: false }));
    stream.addEventListener("sync", () => {
      void sync();
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
        ) return;
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
      setState((old) => ({ ...old, connected: false }));
    });
    const focus = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      typingTimers.forEach(clearTimeout);
      stream.close();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [user]);
  const value =
    user && user.id === state.userId
      ? state
      : { revision: 0, connected: false, messages: 0, notifications: 0, typingByConversation: {} };
  return (
    <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>
  );
}
export function useUpdates() {
  return useContext(UpdatesContext);
}
