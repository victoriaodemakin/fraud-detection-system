"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Calendar, CheckCircle2, Clock, Hash, Hourglass, MapPin, Monitor, ShieldX, Store } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TxIcon } from "@/components/bank/tx";
import { Alert, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Card, CardHeader, StatusBadge, cn } from "@/components/ui/base";
import { DefRow } from "@/components/ui/data";
import { useApi } from "@/lib/hooks";
import { dateTime, naira, typeLabel } from "@/lib/format";
import type { CustomerTx } from "@/lib/types";

// The customer's view of a payment: its outcome and a plain timeline. Risk scores, rule
// results and machine learning output are internal to fraud operations and are not shown.
export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, loading, reload } = useApi<CustomerTx>("bank", `/bank/transactions/${id}`);

  if (loading && !d) return <PageLoader />;
  if (error && !d) return <ErrorState message={error} onRetry={reload} />;
  if (!d) return null;

  const credit = d.type === "Collection";
  const cfg =
    d.status === "Approved"
      ? { icon: CheckCircle2, ring: "bg-successsoft text-success", tone: "success" as const, title: "Successful" }
      : d.status === "PendingReview"
        ? { icon: Hourglass, ring: "bg-warnsoft text-warn", tone: "warn" as const, title: "Under review" }
        : { icon: ShieldX, ring: "bg-dangersoft text-danger", tone: "danger" as const, title: d.status === "Rejected" ? "Not completed" : "Not completed" };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/bank/transactions" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-brand"><ArrowLeft size={15} /> All transactions</Link>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <TxIcon type={d.type} size={52} />
            <div>
              <p className="text-sm text-muted">{typeLabel(d.type)}</p>
              <h1 className="text-xl font-semibold text-ink">{d.counterpartyDisplay}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted"><Hash size={12} /> {d.reference}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums text-ink">{credit ? "+" : "-"}{naira(d.amount, { decimals: 2 })}</p>
            <div className="mt-1.5 flex items-center justify-end gap-2"><StatusBadge status={d.status} /><span className="text-xs text-muted">{dateTime(d.createdAt)}</span></div>
          </div>
        </div>

        <div className="border-t border-line bg-soft p-5">
          <div className="flex items-start gap-4">
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring" }} className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", cfg.ring)}><cfg.icon size={24} /></motion.div>
            <div>
              <p className="text-sm font-semibold text-ink">{cfg.title}</p>
              <p className="mt-0.5 text-sm text-ink2">{d.statusMessage}</p>
            </div>
          </div>
        </div>
      </Card>

      {d.status === "PendingReview" && (
        <Alert tone="warn" title="What happens next">
          Our security team is checking this payment, which usually takes a few hours. We will send you a notification as soon as it is complete. You do not need to do anything.
        </Alert>
      )}
      {(d.status === "Blocked" || d.status === "Rejected") && (
        <Alert tone="danger" title="Need help?">
          If you made this payment and want it reviewed, please contact support with the reference <span className="font-mono">{d.reference}</span>.
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Payment details" icon={<Calendar size={16} />} />
          <div className="px-5 py-2">
            <DefRow label="Channel">{d.channel}</DefRow>
            {d.narration && <DefRow label="Narration">{d.narration}</DefRow>}
            {d.merchantCategory && <DefRow label="Category"><span className="inline-flex items-center gap-1"><Store size={13} />{d.merchantCategory}</span></DefRow>}
            {d.shippingAddress && <DefRow label="Shipping address">{d.shippingAddress}</DefRow>}
            <DefRow label="Location"><span className="inline-flex items-center gap-1"><MapPin size={13} />{d.city}, {d.country}</span></DefRow>
            <DefRow label="Submitted"><span className="inline-flex items-center gap-1"><Clock size={13} />{dateTime(d.createdAt)}</span></DefRow>
            {d.reviewedAt && <DefRow label="Review completed"><span className="inline-flex items-center gap-1"><Monitor size={13} />{dateTime(d.reviewedAt)}</span></DefRow>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Timeline" icon={<Clock size={16} />} />
          <ol className="relative space-y-5 border-l border-line p-5 pl-8 ml-3">
            {d.timeline.map((e, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="relative">
                <span className="absolute -left-[41px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-brandsoft"><span className="h-2 w-2 rounded-full bg-brand" /></span>
                <p className="text-sm font-medium text-ink">{e.title}</p>
                <p className="mt-0.5 text-xs text-ink2">{e.detail}</p>
                <p className="mt-1 text-[11px] text-muted">{dateTime(e.at)}</p>
              </motion.li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
