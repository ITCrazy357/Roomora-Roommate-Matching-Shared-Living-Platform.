"use client";
import { useEffect, useState } from "react";
import { apiFetch, isTemporaryApiError } from "@/lib/api";
import { householdError } from "@/lib/household";
import { useUpdates } from "../communications/updates-provider";

export function useHouseholdData<T>(
  path: string,
  { keepOnError = false }: { keepOnError?: boolean } = {},
) {
  const { revision } = useUpdates();
  const [result, setResult] = useState<{ path: string; data: T } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<T>(path, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setResult({ path, data: value });
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          if (!keepOnError || !isTemporaryApiError(error)) setResult(null);
          setError(householdError(error));
        }
      });
    return () => controller.abort();
  }, [path, revision, refresh, keepOnError]);
  return {
    data: result?.path === path ? result.data : null,
    error,
    reload: () => setRefresh((value) => value + 1),
  };
}
