"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { aiError, aiRequest, type AiUsage } from "@/lib/ai";
export function useAi<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refreshUsage = useCallback(async () => {
    try {
      const value = await apiFetch<AiUsage>("/ai/usage");
      if (mounted.current) setUsage(value);
    } catch {}
  }, []);
  useEffect(() => {
    mounted.current = true;
    const changed = (event: Event) =>
      setUsage((event as CustomEvent<AiUsage>).detail);
    window.addEventListener("roomora-ai-usage", changed);
    const initial = new AbortController();
    apiFetch<AiUsage>("/ai/usage", { signal: initial.signal })
      .then(setUsage)
      .catch(() => {});
    return () => {
      mounted.current = false;
      initial.abort();
      controller.current?.abort();
      window.removeEventListener("roomora-ai-usage", changed);
    };
  }, []);
  async function run(path: string, body: unknown) {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const data = await aiRequest<T>(path, body, current.signal);
      if (!current.signal.aborted) {
        setResult(data);
        return data;
      }
    } catch (error) {
      if (!current.signal.aborted) setError(aiError(error));
    } finally {
      if (!current.signal.aborted) {
        setPending(false);
        apiFetch<AiUsage>("/ai/usage", { signal: current.signal })
          .then((value) => {
            if (mounted.current) {
              setUsage(value);
              window.dispatchEvent(
                new CustomEvent("roomora-ai-usage", { detail: value }),
              );
            }
          })
          .catch(() => {});
      }
      controller.current = null;
    }
  }
  function clear() {
    setResult(null);
    setError("");
  }
  return { result, error, pending, usage, run, clear, refreshUsage };
}
