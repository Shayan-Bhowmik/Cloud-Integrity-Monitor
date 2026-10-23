import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import { dataVersion } from "../lib/events";

export interface Resource<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  /** True only for the first load; later refreshes keep showing the previous data. */
  initialLoading: boolean;
  reload: () => void;
}

/**
 * Loads data with an AbortController, cancels on unmount, and refetches whenever
 * another view reports a mutation through notifyDataChanged().
 */
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const hasData = useRef(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => dataVersion.subscribe(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loaderRef
      .current(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        hasData.current = true;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, error, loading, initialLoading: loading && !hasData.current, reload };
}
