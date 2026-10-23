import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-ok" },
  error: { icon: ShieldAlert, className: "text-danger" },
  warning: { icon: AlertTriangle, className: "text-warn" },
  info: { icon: Info, className: "text-cyan" },
};

function ToastCard({ item, onRemove }: { item: ToastItem; onRemove: (id: number) => void }) {
  const { icon: Icon, className } = TONE_STYLES[item.tone];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClose = useCallback(() => onRemove(item.id), [onRemove, item.id]);

  const start = useCallback(() => {
    timer.current = setTimeout(onClose, item.tone === "error" ? 8000 : 5000);
  }, [onClose, item.tone]);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  useEffect(() => {
    start();
    return stop;
  }, [start]);

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={stop}
      onMouseLeave={start}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line-strong bg-panel-2/95 p-3.5 shadow-(--shadow-pop) backdrop-blur animate-rise-in"
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${className}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm break-words text-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-m-1 rounded-md p-1 text-muted transition hover:bg-white/5 hover:text-text"
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { id, tone, title, description }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      warning: (t, d) => push("warning", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <div className="flex w-full max-w-sm flex-col gap-2">
          {items.map((item) => (
            <ToastCard key={item.id} item={item} onRemove={remove} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
