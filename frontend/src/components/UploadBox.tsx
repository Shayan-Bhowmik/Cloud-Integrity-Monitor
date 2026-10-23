import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { CheckCircle2, CloudUpload, Loader2, X, XCircle } from "lucide-react";
import { api, ApiError, errorMessage, MAX_UPLOAD_BYTES } from "../lib/api";
import { notifyDataChanged } from "../lib/events";
import { formatBytes } from "../lib/format";
import { useToast } from "./ui/Toast";

interface UploadItem {
  key: number;
  name: string;
  size: number;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  message?: string;
}

export function UploadBox() {
  const toast = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const busy = items.some((i) => i.state === "uploading" || i.state === "queued");
  const controllerRef = useRef<AbortController | null>(null);
  const nextKey = useRef(1);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const update = (key: number, patch: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || busy) return;
    const files = Array.from(fileList);
    const accepted: { file: File; key: number }[] = [];
    const queued: UploadItem[] = [];

    for (const file of files) {
      const key = nextKey.current++;
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is too large`, `The limit is ${formatBytes(MAX_UPLOAD_BYTES)}; this file is ${formatBytes(file.size)}.`);
        queued.push({ key, name: file.name, size: file.size, progress: 0, state: "error", message: "Over 10 MB limit" });
        continue;
      }
      accepted.push({ file, key });
      queued.push({ key, name: file.name, size: file.size, progress: 0, state: "queued" });
    }
    setItems(queued);
    if (accepted.length === 0) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    let uploaded = 0;
    for (const { file, key } of accepted) {
      if (controller.signal.aborted) {
        update(key, { state: "error", message: "Cancelled" });
        continue;
      }
      update(key, { state: "uploading" });
      try {
        const version = await api.uploadFile(file, {
          signal: controller.signal,
          onProgress: (p) => update(key, { progress: p }),
        });
        uploaded++;
        update(key, { state: "done", progress: 1, message: `Saved as version ${version.version_no}` });
        toast.success(
          version.version_no > 1 ? `New version of ${file.name}` : `${file.name} backed up`,
          `Version ${version.version_no} · SHA-256 ${version.sha256.slice(0, 12)}… · signed`,
        );
      } catch (err) {
        const aborted = err instanceof ApiError && err.kind === "aborted";
        update(key, { state: "error", message: aborted ? "Cancelled" : errorMessage(err) });
        if (!aborted) toast.error(`Upload failed: ${file.name}`, errorMessage(err));
      }
    }
    controllerRef.current = null;
    if (uploaded > 0) notifyDataChanged();
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby={`${inputId}-title`}>
      <h2 id={`${inputId}-title`} className="text-sm font-medium text-muted">
        Upload a backup
      </h2>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition focus-within:border-cyan/70 ${
          dragging ? "border-cyan bg-cyan/5" : "border-line-strong hover:border-cyan/50 hover:bg-white/[0.02]"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <CloudUpload className={`size-8 ${dragging ? "text-cyan" : "text-muted"}`} aria-hidden />
        <span className="mt-3 text-sm font-medium text-text">
          <span className="text-cyan">Choose a file</span> or drag it here
        </span>
        <span className="mt-1 text-xs text-muted">Up to 10 MB. Uploading an existing name adds a new version.</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border border-line/70 bg-bg-deep/40 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                {item.state === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
                ) : item.state === "error" ? (
                  <XCircle className="size-4 shrink-0 text-danger" aria-hidden />
                ) : (
                  <Loader2 className="size-4 shrink-0 animate-spin text-cyan" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-text">{item.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(item.size)}</span>
              </div>
              {(item.state === "uploading" || item.state === "queued") && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Uploading ${item.name}`} aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-cyan transition-[width]" style={{ width: `${Math.max(4, item.progress * 100)}%` }} />
                </div>
              )}
              {item.message && (
                <p className={`mt-1 text-xs ${item.state === "error" ? "text-danger" : "text-muted"}`}>{item.message}</p>
              )}
              {item.state === "uploading" && item.progress >= 1 && (
                <p className="mt-1 text-xs text-muted">Hashing and signing on the server…</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => controllerRef.current?.abort()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted hover:text-text"
        >
          <X className="size-3.5" aria-hidden /> Cancel upload
        </button>
      )}
    </section>
  );
}
