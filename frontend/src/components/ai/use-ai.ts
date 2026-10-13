"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { aiError, aiRequest, type AiUsage } from "@/lib/ai";
export function useAi<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const initial = new AbortController();
    apiFetch<AiUsage>("/ai/usage", { signal: initial.signal })
      .then(setUsage)
      .catch(() => {});
    return () => {
      mounted.current = false;
      initial.abort();
      controller.current?.abort();
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
      if (!current.signal.aborted) setResult(data);
    } catch (error) {
      if (!current.signal.aborted) setError(aiError(error));
    } finally {
      if (!current.signal.aborted) {
        setPending(false);
        apiFetch<AiUsage>("/ai/usage", { signal: current.signal })
          .then((value) => {
            if (mounted.current) setUsage(value);
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
  return { result, error, pending, usage, run, clear };
}
