"use client";

import clsx from "clsx";
import { AlertCircle, Camera, CheckCircle2, ImagePlus, Loader2, RotateCcw, Sparkles, Table2, X } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, Badge, Button, formatBytes, goToLogin, ProgressBar, toast } from "./ui";

type Phase = "preparing" | "queued" | "uploading" | "uploaded" | "upload-failed";
type ExtractState = "idle" | "queued" | "processing" | "done" | "failed";

type Item = {
  id: string;
  name: string;
  size: number;
  blob?: Blob;
  previewUrl?: string;
  phase: Phase;
  progress: number; // 0..1 upload progress
  error?: string;
  imageId?: string;
  extract: ExtractState;
  extractError?: string;
  found?: number;
  resumed?: boolean;
  prepBusy?: boolean;
};

type BatchInfo = {
  id: string;
  createdAt: string;
  uploadedBy: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
  contacts: number;
};

const UPLOAD_CONCURRENCY = 3;
const PREP_CONCURRENCY = 2;
const EXTRACT_CONCURRENCY = 2; // keeps us inside free-tier rate limits
const MAX_EDGE = 2000;

/** Converts HEIC, fixes EXIF rotation and shrinks the photo so uploads are fast and fit request limits. */
async function prepareImage(file: File): Promise<Blob> {
  let src: Blob = file;
  if (/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    src = Array.isArray(out) ? out[0] : out;
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(src, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read this image");
  }
  {
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    if (blob) return blob;
  }
  throw new Error("Couldn't convert this image");
}

function uploadWithProgress(url: string, blob: Blob, name: string, onProgress: (f: number) => void, xhrs: Map<string, XMLHttpRequest>, key: string) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrs.set(key, xhr);
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      xhrs.delete(key);
      let body: { id?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 401) goToLogin();
      if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body.id);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      xhrs.delete(key);
      reject(new Error("Network error"));
    };
    xhr.onabort = () => {
      xhrs.delete(key);
      reject(new Error("Cancelled"));
    };
    const fd = new FormData();
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
    fd.append("file", blob, `${name.replace(/\.[^.]+$/, "")}.${ext}`);
    fd.append("name", name);
    xhr.send(fd);
  });
}

export function Uploader({
  eventId,
  onContactsChanged,
  onBusyChange,
  onViewContacts,
}: {
  eventId: string;
  onContactsChanged: () => void;
  onBusyChange: (busy: boolean) => void;
  onViewContacts: () => void;
}) {
  const items = useRef<Item[]>([]);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const frame = useRef(0);
  const batchPromise = useRef<Promise<string> | null>(null);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const [extracting, setExtracting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<BatchInfo[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const render = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      rerender();
    });
  }, []);

  const patch = useCallback(
    (id: string, p: Partial<Item>) => {
      const it = items.current.find((i) => i.id === id);
      if (it) Object.assign(it, p);
      render();
    },
    [render],
  );

  const ensureBatch = useCallback(() => {
    batchPromise.current ??= api<{ id: string }>(`/api/events/${eventId}/batches`, { method: "POST" })
      .then((r) => r.id)
      .catch((e) => {
        batchPromise.current = null;
        throw e;
      });
    return batchPromise.current;
  }, [eventId]);

  /* ---------- upload queue ---------- */
  const pumpUploads = useCallback(() => {
    const active = items.current.filter((i) => i.phase === "uploading").length;
    const next = items.current.filter((i) => i.phase === "queued").slice(0, Math.max(0, UPLOAD_CONCURRENCY - active));
    for (const it of next) {
      it.phase = "uploading";
      it.progress = 0;
      it.error = undefined;
      (async () => {
        try {
          const batchId = await ensureBatch();
          const imageId = await uploadWithProgress(
            `/api/batches/${batchId}/images`,
            it.blob!,
            it.name,
            (f) => patch(it.id, { progress: f }),
            xhrs.current,
            it.id,
          );
          patch(it.id, { phase: "uploaded", progress: 1, imageId });
        } catch (e) {
          if (items.current.includes(it)) patch(it.id, { phase: "upload-failed", error: (e as Error).message });
        } finally {
          pumpUploads();
        }
      })();
    }
    render();
  }, [ensureBatch, patch, render]);

  /* ---------- preparation queue ---------- */
  const files = useRef(new Map<string, File>());
  const pumpPrep = useCallback(() => {
    const preparing = items.current.filter((i) => i.phase === "preparing" && i.prepBusy).length;
    const waiting = items.current.filter((i) => i.phase === "preparing" && !i.prepBusy);
    for (const it of waiting.slice(0, Math.max(0, PREP_CONCURRENCY - preparing))) {
      it.prepBusy = true;
      const file = files.current.get(it.id)!;
      prepareImage(file)
        .then((blob) => {
          if (!items.current.includes(it)) return;
          patch(it.id, { blob, size: blob.size, previewUrl: URL.createObjectURL(blob), phase: "queued" });
          pumpUploads();
        })
        .catch((e) => patch(it.id, { phase: "upload-failed", error: (e as Error).message }))
        .finally(() => {
          files.current.delete(it.id);
          pumpPrep();
        });
    }
  }, [patch, pumpUploads]);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const accepted: File[] = [];
      let rejected = 0;
      for (const f of Array.from(list)) {
        if (f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) accepted.push(f);
        else rejected++;
      }
      if (rejected) toast(`${rejected} file${rejected > 1 ? "s" : ""} skipped (not images)`, "info");
      // Starting a new set after the previous one finished processing begins a new batch.
      if (items.current.length && items.current.every((i) => i.extract === "done")) reset();
      for (const f of accepted) {
        const id = crypto.randomUUID();
        files.current.set(id, f);
        items.current.push({ id, name: f.name, size: f.size, phase: "preparing", progress: 0, extract: "idle" });
      }
      render();
      pumpPrep();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pumpPrep, render],
  );

  const removeItem = (it: Item) => {
    xhrs.current.get(it.id)?.abort();
    files.current.delete(it.id);
    if (it.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
    if (it.imageId && it.extract !== "done") {
      api(`/api/images/${it.imageId}`, { method: "DELETE" }).catch((e) => toast((e as Error).message, "error"));
    }
    items.current = items.current.filter((i) => i !== it);
    render();
  };

  const retryUpload = (it: Item) => {
    if (!it.blob) {
      removeItem(it);
      return;
    }
    patch(it.id, { phase: "queued", progress: 0, error: undefined });
    pumpUploads();
  };

  function reset() {
    for (const it of items.current) if (it.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
    items.current = [];
    batchPromise.current = null;
    render();
  }

  /* ---------- extraction ---------- */
  const loadHistory = useCallback(async () => {
    try {
      const r = await api<{ batches: BatchInfo[]; pending: { id: string; name: string; status: string; error: string | null; size: number }[] }>(
        `/api/events/${eventId}/batches`,
      );
      setHistory(r.batches);
      return r.pending;
    } catch {
      return [];
    }
  }, [eventId]);

  // On first load, bring back cards uploaded earlier but never processed (e.g. the tab was closed).
  useEffect(() => {
    loadHistory().then((pending) => {
      if (items.current.length || pending.length === 0) return;
      items.current = pending.map((p) => ({
        id: crypto.randomUUID(),
        name: p.name || "card",
        size: p.size,
        previewUrl: `/api/images/${p.id}`,
        phase: "uploaded" as const,
        progress: 1,
        imageId: p.id,
        extract: p.status === "FAILED" ? ("failed" as const) : ("idle" as const),
        extractError: p.status === "FAILED" ? "Previous attempt failed" : undefined,
        resumed: true,
      }));
      render();
    });
  }, [loadHistory, render]);

  const runExtraction = async () => {
    const targets = items.current.filter((i) => i.phase === "uploaded" && (i.extract === "idle" || i.extract === "failed"));
    if (!targets.length) return;
    targets.forEach((t) => Object.assign(t, { extract: "queued", extractError: undefined }));
    setExtracting(true);
    render();

    let lastRefresh = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh > 1500) {
        lastRefresh = now;
        onContactsChanged();
      }
    };

    const queue = [...targets];
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        if (!items.current.includes(it)) continue;
        patch(it.id, { extract: "processing" });
        try {
          const r = await api<{ status: string; contacts: number }>(`/api/images/${it.imageId}/extract`, { method: "POST" });
          patch(it.id, { extract: "done", found: r.contacts });
          if (r.contacts) refresh();
        } catch (e) {
          patch(it.id, { extract: "failed", extractError: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: EXTRACT_CONCURRENCY }, worker));

    setExtracting(false);
    onContactsChanged();
    loadHistory();
    const found = targets.reduce((s, t) => s + (t.found ?? 0), 0);
    const failed = targets.filter((t) => t.extract === "failed").length;
    toast(
      failed ? `Read ${found} card${found === 1 ? "" : "s"}. ${failed} photo${failed > 1 ? "s" : ""} failed; you can retry.` : `Read ${found} card${found === 1 ? "" : "s"} from ${targets.length} photo${targets.length === 1 ? "" : "s"}`,
      failed ? "error" : "success",
    );
  };

  /* ---------- derived state ---------- */
  const list = items.current;
  const totalBytes = list.reduce((s, i) => s + i.size, 0);
  const sentBytes = list.reduce((s, i) => s + i.size * (i.phase === "uploaded" ? 1 : i.phase === "uploading" ? i.progress : 0), 0);
  const uploadedCount = list.filter((i) => i.phase === "uploaded").length;
  const failedUploads = list.filter((i) => i.phase === "upload-failed").length;
  const uploading = list.some((i) => i.phase === "preparing" || i.phase === "queued" || i.phase === "uploading");
  const allUploaded = list.length > 0 && uploadedCount === list.length;
  const toProcess = list.filter((i) => i.phase === "uploaded" && (i.extract === "idle" || i.extract === "failed"));
  const canProcess = allUploaded && !extracting && toProcess.length > 0;
  const runItems = list.filter((i) => i.extract !== "idle");
  const extractedDone = runItems.filter((i) => i.extract === "done" || i.extract === "failed").length;
  const allDone = list.length > 0 && list.every((i) => i.extract === "done");
  const foundTotal = list.reduce((s, i) => s + (i.found ?? 0), 0);
  const onlyRetries = toProcess.length > 0 && toProcess.every((i) => i.extract === "failed");

  useEffect(() => onBusyChange(uploading || extracting), [uploading, extracting, onBusyChange]);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={clsx(
          "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white",
        )}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <ImagePlus />
        </div>
        <p className="font-medium text-slate-800">Drop business card photos here</p>
        <p className="mt-1 text-sm text-slate-500">JPG, PNG, WEBP or HEIC. Add as many as you like. One photo can contain several cards.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={16} /> Choose photos
          </Button>
          <Button className="sm:hidden" onClick={() => cameraInput.current?.click()}>
            <Camera size={16} /> Take photo
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {list.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* Batch progress */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-[240px] flex-1">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">
                  {uploading ? "Uploading batch…" : failedUploads ? "Some uploads failed" : "Upload complete"}
                </span>
                <span className="tabular-nums text-slate-500">
                  {uploadedCount}/{list.length} files · {formatBytes(sentBytes)} / {formatBytes(totalBytes)}
                </span>
              </div>
              <ProgressBar value={totalBytes ? (sentBytes / totalBytes) * 100 : 0} tone={failedUploads ? "amber" : allUploaded ? "green" : "indigo"} />
              {runItems.length > 0 && (
                <>
                  <div className="mb-1.5 mt-4 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Sparkles size={14} className="text-indigo-600" />
                      {extracting ? "Reading cards…" : "Reading finished"}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {extractedDone}/{runItems.length} photos · {foundTotal} cards
                    </span>
                  </div>
                  <ProgressBar value={(extractedDone / runItems.length) * 100} tone={extracting ? "indigo" : "green"} />
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {allDone && !extracting ? (
                <div className="flex gap-2">
                  <Button onClick={reset}>New batch</Button>
                  <Button variant="primary" onClick={onViewContacts}>
                    <Table2 size={16} /> View cards
                  </Button>
                </div>
              ) : (
                <Button variant="primary" size="lg" disabled={!canProcess} onClick={runExtraction}>
                  {extracting ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {extracting ? "Processing…" : onlyRetries ? `Retry ${toProcess.length} failed` : `Process ${toProcess.length || ""} card${toProcess.length === 1 ? "" : "s"}`}
                </Button>
              )}
              {!allUploaded && !extracting && (
                <span className="text-xs text-slate-500">
                  {uploading ? "Processing unlocks when every upload finishes" : "Retry or remove failed uploads to continue"}
                </span>
              )}
            </div>
          </div>

          {/* Per-file grid */}
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {list.map((it) => (
              <li key={it.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <div className="relative aspect-[16/10] bg-slate-100">
                  {it.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.previewUrl} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <Loader2 className="animate-spin" size={20} />
                    </div>
                  )}
                  {it.extract === "processing" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-indigo-900/40 text-white">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}
                  {!extracting && it.extract !== "processing" && (
                    <button
                      onClick={() => removeItem(it)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-slate-600 opacity-100 shadow hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Remove"
                      aria-label={`Remove ${it.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-700" title={it.name}>{it.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{formatBytes(it.size)}</span>
                  </div>
                  <ProgressBar
                    value={it.phase === "uploaded" ? 100 : it.progress * 100}
                    tone={it.phase === "upload-failed" ? "red" : it.phase === "uploaded" ? "green" : "indigo"}
                    className="h-1.5"
                  />
                  <ItemStatus it={it} onRetry={() => retryUpload(it)} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Batch history</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Uploaded</th>
                  <th className="px-4 py-2 font-medium">By</th>
                  <th className="px-4 py-2 text-right font-medium">Cards</th>
                  <th className="px-4 py-2 text-right font-medium">Cards</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-slate-700">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-700">{b.uploadedBy}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.total}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.contacts}</td>
                    <td className="px-4 py-2">
                      {b.pending ? <Badge tone="amber">{b.pending} not processed</Badge> : b.failed ? <Badge tone="red">{b.failed} failed</Badge> : <Badge tone="green">Complete</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ItemStatus({ it, onRetry }: { it: Item; onRetry: () => void }) {
  const cls = "flex items-center gap-1 text-[11px]";
  if (it.phase === "preparing") return <div className={clsx(cls, "text-slate-500")}>Preparing…</div>;
  if (it.phase === "queued") return <div className={clsx(cls, "text-slate-500")}>Waiting…</div>;
  if (it.phase === "uploading") return <div className={clsx(cls, "tabular-nums text-indigo-600")}>Uploading {Math.round(it.progress * 100)}%</div>;
  if (it.phase === "upload-failed")
    return (
      <div className={clsx(cls, "justify-between text-red-600")}>
        <span className="truncate" title={it.error}>{it.error || "Failed"}</span>
        <button onClick={onRetry} className="flex shrink-0 items-center gap-0.5 font-medium hover:underline">
          {it.blob ? (
            <>
              <RotateCcw size={11} /> Retry
            </>
          ) : (
            <>
              <X size={11} /> Remove
            </>
          )}
        </button>
      </div>
    );
  if (it.extract === "processing") return <div className={clsx(cls, "text-indigo-600")}>Reading card…</div>;
  if (it.extract === "queued") return <div className={clsx(cls, "text-slate-500")}>Queued for AI</div>;
  if (it.extract === "done")
    return (
      <div className={clsx(cls, it.found ? "text-emerald-600" : "text-amber-600")}>
        {it.found ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
        {it.found ? `${it.found} card${it.found > 1 ? "s" : ""} found` : "No card detected"}
      </div>
    );
  if (it.extract === "failed")
    return (
      <div className={clsx(cls, "text-red-600")} title={it.extractError}>
        <AlertCircle size={12} /> <span className="truncate">{it.extractError || "Extraction failed"}</span>
      </div>
    );
  return (
    <div className={clsx(cls, "text-emerald-600")}>
      <CheckCircle2 size={12} /> {it.resumed ? "Uploaded earlier" : "Uploaded"}
    </div>
  );
}
