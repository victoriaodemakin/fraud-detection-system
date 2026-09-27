"use client";

import { animate, motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card, cn } from "./base";

// ------------------------------------------------------------------ tables
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}
export const Table = ({ children }: { children: ReactNode }) => <table className="w-full border-collapse text-left text-sm">{children}</table>;
export const THead = ({ children }: { children: ReactNode }) => <thead className="bg-soft">{children}</thead>;
export const TH = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn("whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted", className)}>{children}</th>
);
export const TR = ({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) => (
  <tr onClick={onClick} className={cn("border-t border-line transition-colors", onClick && "cursor-pointer hover:bg-brandsoft/60", className)}>
    {children}
  </tr>
);
export const TD = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn("px-4 py-3 align-middle text-ink2", className)}>{children}</td>;

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        {from}-{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button className="rounded-lg border border-line p-1.5 hover:bg-surface2 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="px-2 font-medium text-ink2">
          Page {page} of {pages}
        </span>
        <button className="rounded-lg border border-line p-1.5 hover:bg-surface2 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tabs
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-surface2 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === it.value ? "bg-surface text-brand shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cn("rounded-full px-1.5 text-[11px]", value === it.value ? "bg-brandsoft text-brand" : "bg-line text-muted")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ stat card
export function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setDisplay(v) });
    return () => c.stop();
  }, [inView, value]);
  const shown = inView ? display : 0;
  return <span ref={ref}>{format ? format(shown) : Math.round(shown).toLocaleString()}</span>;
}

export function StatCard({
  label,
  value,
  format,
  icon,
  hint,
  tone = "purple",
  delta,
}: {
  label: string;
  value: number | string;
  format?: (n: number) => string;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: "purple" | "blue" | "success" | "warn" | "danger";
  delta?: { value: string; good?: boolean };
}) {
  const toneCls = {
    purple: "bg-brandsoft text-brand",
    blue: "bg-brand2soft text-brand2",
    success: "bg-successsoft text-success",
    warn: "bg-warnsoft text-warn",
    danger: "bg-dangersoft text-danger",
  }[tone];
  return (
    <Card className="p-5" hover>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", toneCls)}>{icon}</div>}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink tabular-nums">
        {typeof value === "number" ? <AnimatedNumber value={value} format={format} /> : value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {delta && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", delta.good ? "text-success" : "text-danger")}>
            {delta.good ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {delta.value}
          </span>
        )}
        {hint}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ motion helpers
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

export function Progress({ value, max = 100, tone = "brand" }: { value: number; max?: number; tone?: "brand" | "success" | "warn" | "danger" }) {
  const color = { brand: "var(--brand)", success: "var(--success)", warn: "var(--warn)", danger: "var(--danger)" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

export function DefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}
