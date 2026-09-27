"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Hourglass, ShieldX, Lock, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button, Card, CardHeader, PageHeader, LinkButton } from "@/components/ui/base";
import { DefRow } from "@/components/ui/data";
import { ApiError, api } from "@/lib/http";
import { dateTime, naira, typeLabel } from "@/lib/format";
import type { TxResult } from "@/lib/types";
import { useBank } from "./BankShell";
import { SimulationPanel, simPayload, useSimulation } from "./simulation";

// Submits a payment with the demo-lab context attached, then refreshes the balance.
export function usePayment(path: string) {
  const { refresh, refreshUnread } = useBank();
  const { sim, reset: resetLab } = useSimulation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinError, setPinError] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setPinError(false);
    try {
      const res = await api<TxResult>("bank", path, { method: "POST", body: { ...body, sim: simPayload(sim) } });
      setResult(res);
      resetLab(); // the demo lab applies to one payment only, so it cannot leak into the next test
      refresh();
      refreshUnread();
      return res;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setPinError(e.code === "pin");
      } else setError("The payment could not be completed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { submit, busy, error, pinError, result, reset: () => setResult(null) };
}

export function PaymentPage({ title, subtitle, children, result, onAgain }: { title: string; subtitle: string; children: ReactNode; result: TxResult | null; onAgain: () => void }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      {result ? (
        <ResultCard r={result} onAgain={onAgain} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div>{children}</div>
          <div className="space-y-5">
            <SimulationPanel />
            <ProtectionNote />
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectionNote() {
  return (
    <Card>
      <CardHeader title="Your payment is protected" icon={<Lock size={16} />} />
      <ol className="space-y-3 p-5 text-sm text-ink2">
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-successsoft text-xs font-semibold text-success">1</span>Most payments are approved instantly.</li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warnsoft text-xs font-semibold text-warn">2</span>Some are held for a quick review by our security team. Your money stays in your account meanwhile.</li>
        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-dangersoft text-xs font-semibold text-danger">3</span>Payments that look clearly fraudulent are stopped to protect you.</li>
      </ol>
    </Card>
  );
}

export function FromAccount() {
  const { profile } = useBank();
  const a = profile.accounts[0];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-soft px-4 py-3.5">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted">From</p>
        <p className="text-sm font-semibold text-ink">{a.type} ••••{a.accountNumber.slice(-4)}</p>
      </div>
      <div className="text-right">
        <p className="text-[11px] uppercase tracking-wider text-muted">Available</p>
        <p className="text-sm font-semibold tabular-nums text-ink">{naira(a.balance, { decimals: 2 })}</p>
      </div>
    </div>
  );
}

export function PaymentError({ error }: { error: string | null }) {
  return error ? <Alert tone="danger">{error}</Alert> : null;
}

export const QUICK_AMOUNTS = [1000, 5000, 10000, 50000, 200000];

export function AmountChips({ value, onPick, amounts = QUICK_AMOUNTS }: { value: string; onPick: (v: string) => void; amounts?: number[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {amounts.map((a) => (
        <button key={a} type="button" onClick={() => onPick(String(a))} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${String(a) === value ? "border-brand bg-brandsoft text-brand" : "border-line bg-surface text-ink2 hover:border-brand/40"}`}>
          {naira(a, { compact: true })}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer-facing outcome only: successful, under review, or not completed. The screening
// details (risk score, rule results, ML output) are visible to analysts only.
export function ResultCard({ r, onAgain }: { r: TxResult; onAgain: () => void }) {
  const cfg =
    r.status === "Approved"
      ? { icon: CheckCircle2, title: "Payment successful", hero: "linear-gradient(135deg,#0f7a4d,#1e3a8a)" }
      : r.status === "PendingReview"
        ? { icon: Hourglass, title: "Your payment is under review", hero: "linear-gradient(135deg,#a35a06,#4c1d95)" }
        : { icon: ShieldX, title: "Payment not completed", hero: "linear-gradient(135deg,#b42318,#3b1275)" };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
      <div className="px-6 py-10 text-center text-white" style={{ background: cfg.hero }}>
        <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.15 }} className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20">
          <cfg.icon size={44} />
        </motion.div>
        <h2 className="mt-5 text-2xl font-semibold">{cfg.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/85">{r.message}</p>
        <p className="mt-4 text-4xl font-semibold tabular-nums">{naira(r.amount, { decimals: 2 })}</p>
      </div>

      <div className="p-6">
        <DefRow label="Type">{typeLabel(r.type)}</DefRow>
        <DefRow label="To / from">{r.counterpartyDisplay}</DefRow>
        <DefRow label="Reference"><span className="font-mono text-xs">{r.reference}</span></DefRow>
        <DefRow label="Time">{dateTime(r.createdAt)}</DefRow>
        <DefRow label="Balance now">{naira(r.newBalance, { decimals: 2 })}</DefRow>

        {r.status === "PendingReview" && <div className="mt-4"><Alert tone="warn">Your money is safe and has not left your account. We will notify you as soon as the review is complete, usually within a few hours.</Alert></div>}
        {r.status === "Blocked" && <div className="mt-4"><Alert tone="danger">Your money has not left your account. If this payment was you, please contact support and quote the reference above.</Alert></div>}

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href={`/bank/transactions/${r.transactionId}`} icon={<ReceiptText size={17} />}>View this payment</LinkButton>
          <Button variant="secondary" onClick={onAgain}>Make another payment</Button>
          <Link href="/bank" className="ml-auto self-center text-sm font-medium text-brand hover:underline">Back to dashboard</Link>
        </div>
      </div>
    </motion.div>
  );
}
