export const NAIRA = "\u20A6";

export function naira(n: number | null | undefined, opts: { compact?: boolean; decimals?: number } = {}) {
  const v = Number(n ?? 0);
  if (opts.compact) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${NAIRA}${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${NAIRA}${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${NAIRA}${(v / 1e3).toFixed(0)}K`;
  }
  return `${NAIRA}${v.toLocaleString("en-NG", { minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 2 })}`;
}

export function num(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-NG");
}

export function pct(n: number | null | undefined, digits = 1) {
  return `${(Number(n ?? 0) * 100).toFixed(digits)}%`;
}

export function dateTime(s: string | Date | null | undefined) {
  if (!s) return "-";
  const d = new Date(s.toString().endsWith("Z") || /[+-]\d\d:\d\d$/.test(s.toString()) ? s : s + "Z");
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dateOnly(s: string | Date | null | undefined) {
  if (!s) return "-";
  const d = new Date(s.toString().endsWith("Z") || /[+-]\d\d:\d\d$/.test(s.toString()) ? s : s + "Z");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(s: string | Date | null | undefined) {
  if (!s) return "-";
  const t = new Date(s.toString().endsWith("Z") || /[+-]\d\d:\d\d$/.test(s.toString()) ? s : s + "Z").getTime();
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return dateOnly(s);
}

export const TYPE_LABEL: Record<string, string> = {
  Transfer: "Transfer",
  BillPayment: "Bill payment",
  Collection: "Money request",
  CardPayment: "Card payment",
  AtmWithdrawal: "ATM withdrawal",
};

export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

export const STATUS_LABEL: Record<string, string> = {
  Approved: "Approved",
  PendingReview: "Held for review",
  Blocked: "Blocked",
  Rejected: "Declined",
};

export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
