"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UsePollingOptions {
  interval: number;
  enabled?: boolean;
}

interface UsePollingResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePolling<T>(
  url: string,
  options: UsePollingOptions
): UsePollingResult<T> {
  const { interval, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled) return;
    fetchData();

    const timer = setInterval(() => {
      if (!document.hidden) fetchData();
    }, interval);

    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchData, interval, enabled]);

  return { data, isLoading, error, refetch: fetchData };
}
