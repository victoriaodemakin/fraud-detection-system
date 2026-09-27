"use client";

import clsx, { type ClassValue } from "clsx";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cn = (...v: ClassValue[]) => clsx(v);

// ------------------------------------------------------------------ buttons
type Variant = "primary" | "secondary" | "outline" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-gradient text-white shadow-card hover:brightness-110 active:brightness-95",
  secondary: "bg-surface2 text-ink border border-line hover:border-linestrong hover:bg-brandsoft",
  outline: "bg-transparent text-brand border border-brand/40 hover:bg-brandsoft",
  danger: "bg-danger text-white hover:brightness-110",
  success: "bg-success text-white hover:brightness-110",
  ghost: "bg-transparent text-ink2 hover:bg-surface2",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition disabled:cursor-not-allowed disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={size === "sm" ? 14 : 16} /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center font-medium transition", VARIANTS[variant], SIZES[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ cards
export function Card({ children, className, hover }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card", hover && "transition hover:-translate-y-0.5 hover:border-linestrong hover:shadow-pop", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brandsoft text-brand">{icon}</div>}
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ form controls
const CONTROL =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:opacity-60";

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-xs font-medium text-ink2">{label}</label>}
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({ icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  if (icon)
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
        <input className={cn(CONTROL, "h-11 pl-10", className)} {...props} />
      </div>
    );
  return <input className={cn(CONTROL, "h-11", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "h-11 appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-9", className)} {...props}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237c78a8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-24 py-2.5", className)} {...props} />;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50", checked ? "bg-brand" : "bg-linestrong")}
    >
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

// ------------------------------------------------------------------ badges
type Tone = "neutral" | "purple" | "blue" | "success" | "warn" | "danger" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface2 text-ink2 border-line",
  purple: "bg-brandsoft text-brand border-brand/20",
  blue: "bg-brand2soft text-brand2 border-brand2/20",
  success: "bg-successsoft text-success border-success/25",
  warn: "bg-warnsoft text-warn border-warn/25",
  danger: "bg-dangersoft text-danger border-danger/25",
  info: "bg-infosoft text-info border-info/25",
};

export function Badge({ tone = "neutral", children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function RiskBadge({ tier }: { tier?: string | null }) {
  const tone: Tone = tier === "Low" ? "success" : tier === "Medium" ? "warn" : tier === "High" ? "danger" : "neutral";
  return <Badge tone={tone}>{tier && tier !== "-" ? `${tier} risk` : "-"}</Badge>;
}

const STATUS_TONE: Record<string, Tone> = { Approved: "success", PendingReview: "warn", Blocked: "danger", Rejected: "neutral" };
const STATUS_TEXT: Record<string, string> = { Approved: "Approved", PendingReview: "Held for review", Blocked: "Blocked", Rejected: "Declined" };

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_TEXT[status] ?? status}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "Pass") return <Badge tone="success">Pass</Badge>;
  if (outcome === "Fail") return <Badge tone="danger">Fail</Badge>;
  return <Badge tone="neutral">Not applicable</Badge>;
}

export function tierColor(tier?: string) {
  return tier === "Low" ? "var(--success)" : tier === "Medium" ? "var(--warn)" : tier === "High" ? "var(--danger)" : "var(--muted)";
}

// A 0-100 score bar coloured by tier.
export function ScoreMeter({ score, tier, compact }: { score: number; tier?: string; compact?: boolean }) {
  const color = tierColor(tier ?? (score <= 30 ? "Low" : score <= 65 ? "Medium" : "High"));
  return (
    <div className={cn("flex items-center gap-2", compact ? "w-24" : "w-32")}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, score)}%`, background: color }} />
      </div>
      <span className="w-7 text-right text-xs font-semibold tabular-nums" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export function Avatar({ name, size = 36, tone = "purple" }: { name: string; size?: number; tone?: "purple" | "blue" }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: tone === "purple" ? "linear-gradient(135deg,#5b21b6,#3730a3)" : "linear-gradient(135deg,#1e40af,#5b21b6)" }}
    >
      {initials}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}
