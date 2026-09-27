"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Inbox, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button, cn } from "./base";

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-brand", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brandsoft text-brand">{icon ?? <Inbox size={22} />}</div>
      <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dangersoft text-danger">
        <AlertTriangle size={22} />
      </div>
      <p className="text-sm font-semibold text-ink">Something went wrong</p>
      <p className="max-w-md text-xs text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "success"; title?: string; children: ReactNode }) {
  const cls = {
    info: "border-info/25 bg-infosoft text-info",
    warn: "border-warn/30 bg-warnsoft text-warn",
    danger: "border-danger/25 bg-dangersoft text-danger",
    success: "border-success/25 bg-successsoft text-success",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", cls)}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-[13px] leading-relaxed opacity-95">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div className="absolute inset-0 bg-[#0b0a1e]/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn("relative w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-pop", width)}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="text-base font-semibold text-ink">{title}</h3>
                <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-ink" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-soft px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = "max-w-md" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div className="absolute inset-0 bg-[#0b0a1e]/55 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className={cn("absolute right-0 top-0 flex h-full w-full flex-col border-l border-line bg-surface shadow-pop", width)}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
          >
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-ink">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-soft px-5 py-3">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
