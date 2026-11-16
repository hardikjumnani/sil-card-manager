"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-9 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-base",
        variant === "primary" && "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:hover:bg-indigo-600",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-700",
        className,
      )}
    />
  );
}

export function ProgressBar({ value, tone = "indigo", className }: { value: number; tone?: "indigo" | "green" | "red" | "amber"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-2 w-full overflow-hidden rounded-full bg-slate-200", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={clsx(
          "h-full rounded-full transition-[width] duration-200",
          tone === "indigo" && "bg-indigo-600",
          tone === "green" && "bg-emerald-500",
          tone === "red" && "bg-red-500",
          tone === "amber" && "bg-amber-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "green" | "amber" | "red" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "slate" && "bg-slate-100 text-slate-700",
        tone === "indigo" && "bg-indigo-50 text-indigo-700",
        tone === "green" && "bg-emerald-50 text-emerald-700",
        tone === "amber" && "bg-amber-50 text-amber-800",
        tone === "red" && "bg-red-50 text-red-700",
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, email, image, size = 28 }: { name?: string | null; email?: string; image?: string | null; size?: number }) {
  const label = (name || email || "?").trim();
  const initials = label.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  if (image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={label} title={label} width={size} height={size} referrerPolicy="no-referrer" className="rounded-full ring-2 ring-white object-cover" style={{ width: size, height: size }} />;
  return (
    <span title={label} className="inline-flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ring-2 ring-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx("max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

/* ---------- Toasts ---------- */
type ToastMsg = { id: number; text: string; tone: "success" | "error" | "info" };
export function toast(text: string, tone: ToastMsg["tone"] = "success") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { text, tone } = (e as CustomEvent).detail;
      const id = ++n;
      setItems((s) => [...s, { id, text, tone }]);
      setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener("app-toast", on);
    return () => window.removeEventListener("app-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg",
            t.tone === "success" && "bg-slate-900 text-white",
            t.tone === "error" && "bg-red-600 text-white",
            t.tone === "info" && "bg-white text-slate-800 ring-1 ring-slate-200",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** fetch wrapper that throws the API's error message. */
let redirectingToLogin = false;
export function goToLogin() {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;
  window.location.href = `/login?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Session expired or this domain has no session yet: sign in again and come back here.
    goToLogin();
    throw new Error("Your session has expired. Redirecting to sign in…");
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
