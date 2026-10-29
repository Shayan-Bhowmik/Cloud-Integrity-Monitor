// Tiny pub/sub stores shared between the API client and the UI.

type Listener<T> = (value: T) => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l(value));
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Bumped after any mutation (upload, verify, restore, ack, demo) so mounted views refetch. */
export const dataVersion = createStore(0);
export function notifyDataChanged() {
  dataVersion.set(dataVersion.get() + 1);
}

/** Visible state of cold-start retries, rendered by ServerStatusBanner. */
export interface WakeState {
  waking: boolean;
  attempt: number;
  maxAttempts: number;
}
export const wakeState = createStore<WakeState>({ waking: false, attempt: 0, maxAttempts: 0 });

/** Fired when the session can no longer be refreshed; AuthProvider signs out. */
export const sessionExpired = createStore(0);
