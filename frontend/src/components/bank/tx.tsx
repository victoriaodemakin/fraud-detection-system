"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, HandCoins, Receipt, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { StatusBadge, cn } from "@/components/ui/base";
import { dateTime, naira, typeLabel } from "@/lib/format";
import type { TxListItem, TxType } from "@/lib/types";

export const TYPE_ICON: Record<TxType, LucideIcon> = {
  Transfer: Send,
  BillPayment: Receipt,
  Collection: HandCoins,
  CardPayment: CreditCard,
  AtmWithdrawal: Banknote,
};

export function TxIcon({ type, size = 40 }: { type: TxType; size?: number }) {
  const Icon = TYPE_ICON[type] ?? Send;
  const credit = type === "Collection";
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-xl", credit ? "bg-successsoft text-success" : "bg-brandsoft text-brand")} style={{ width: size, height: size }}>
      <Icon size={size * 0.46} />
    </div>
  );
}

export function TxRow({ t }: { t: TxListItem }) {
  const credit = t.type === "Collection";
  const muted = t.status === "Blocked" || t.status === "Rejected";
  return (
    <Link href={`/bank/transactions/${t.transactionId}`} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-brandsoft/60">
      <TxIcon type={t.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{t.counterpartyDisplay}</p>
        <p className="truncate text-xs text-muted">
          {typeLabel(t.type)} · {dateTime(t.createdAt)}
        </p>
      </div>
      <div className="text-right">
        <p className={cn("flex items-center justify-end gap-1 text-sm font-semibold tabular-nums", muted ? "text-muted line-through" : credit ? "text-success" : "text-ink")}>
          {credit ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
          {naira(t.amount)}
        </p>
        <div className="mt-1 flex justify-end"><StatusBadge status={t.status} /></div>
      </div>
    </Link>
  );
}
