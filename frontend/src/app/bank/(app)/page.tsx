"use client";

import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Banknote, Check, Copy, CreditCard, Eye, EyeOff, HandCoins, PiggyBank, Plus, Receipt, Send, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarsChart, DonutChart, Legend2, CHART_COLORS } from "@/components/charts/charts";
import { PromoCarousel } from "@/components/bank/PromoCarousel";
import { TxRow } from "@/components/bank/tx";
import { useBank } from "@/components/bank/BankShell";
import { Badge, Button, Card, CardHeader, Field, Input, LinkButton } from "@/components/ui/base";
import { StatCard } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Modal, PageLoader } from "@/components/ui/feedback";
import { PinInput } from "@/components/ui/pin";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { naira } from "@/lib/format";
import type { TxListItem } from "@/lib/types";

interface Dash {
  income: number;
  spending: number;
  byCategory: { category: string; amount: number }[];
  monthly: { month: string; income: number; spending: number }[];
  recent: TxListItem[];
  unreadNotifications: number;
  heldTransactions: number;
  totalTransactions: number;
}

const QUICK = [
  { href: "/bank/transfer", label: "Transfer", icon: Send },
  { href: "/bank/bills", label: "Pay bills", icon: Receipt },
  { href: "/bank/cards", label: "Card pay", icon: CreditCard },
  { href: "/bank/atm", label: "ATM cash", icon: Banknote },
  { href: "/bank/collect", label: "Request", icon: HandCoins },
  { href: "/bank/beneficiaries", label: "Payees", icon: Users },
];

export default function Dashboard() {
  const { profile, refresh, refreshUnread } = useBank();
  const { data, error, loading, reload } = useApi<Dash>("bank", "/bank/dashboard");
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fund, setFund] = useState(false);
  const account = profile.accounts[0];
  const total = profile.accounts.reduce((a, b) => a + b.balance, 0);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const catTotal = data.byCategory.reduce((a, b) => a + b.amount, 0);
  const donut = data.byCategory.slice(0, 5).map((c, i) => ({ name: c.category, value: c.amount, color: CHART_COLORS[i % 5] }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {greet}, {profile.fullName.split(" ")[0]} <span className="inline-block origin-[70%_70%] animate-[wave_2s_ease-in-out_1]">👋</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Here is what is happening with your money.</p>
        </div>
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setFund(true)}>Fund account</Button>
      </div>

      {/* balance + quick actions */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="hero-mesh relative overflow-hidden rounded-3xl p-6 text-white shadow-pop sm:p-7">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/75">Total balance</p>
              <button onClick={() => setHide(!hide)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15" aria-label="Toggle balance">
                {hide ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{hide ? "₦ •••••••" : naira(total, { decimals: 2 })}</p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/60">{account.type} account</p>
                <p className="mt-0.5 font-mono text-lg tracking-widest">{account.accountNumber.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(account.accountNumber); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-medium hover:bg-white/25"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy number"}
              </button>
            </div>
          </div>
        </motion.div>

        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">Quick actions</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {QUICK.map((q, i) => (
              <motion.div key={q.href} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 * i }}>
                <Link href={q.href} className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-soft px-2 py-4 text-center transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brandsoft">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand shadow-card group-hover:bg-brand group-hover:text-white"><q.icon size={19} /></span>
                  <span className="text-xs font-medium text-ink2">{q.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* held / kyc alerts */}
      {data.heldTransactions > 0 && (
        <Alert tone="warn" title={`${data.heldTransactions} transaction${data.heldTransactions > 1 ? "s are" : " is"} held for security review`}>
          Our fraud team is checking {data.heldTransactions > 1 ? "them" : "it"}. <Link href="/bank/transactions?status=PendingReview" className="font-semibold underline">See the details</Link>.
        </Alert>
      )}
      {profile.kyc !== "Verified" && (
        <Alert tone="warn" title={`Identity check ${profile.kyc === "Pending" ? "pending" : "mismatch"}`}>
          Complete your KYC in <Link href="/bank/profile" className="font-semibold underline">Profile</Link>. Payments from unverified accounts are screened more strictly.
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Money in (30 days)" value={data.income} format={(n) => naira(n, { compact: true })} icon={<ArrowDownLeft size={18} />} tone="success" hint="approved requests" />
        <StatCard label="Money out (30 days)" value={data.spending} format={(n) => naira(n, { compact: true })} icon={<ArrowUpRight size={18} />} tone="purple" hint="approved payments" />
        <StatCard label="Held for review" value={data.heldTransactions} icon={<ShieldAlert size={18} />} tone="warn" hint="awaiting an analyst" />
        <StatCard label="Transactions" value={data.totalTransactions} icon={<PiggyBank size={18} />} tone="blue" hint="last 6 months" />
      </div>

      <PromoCarousel />

      {/* charts */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Money in vs money out" subtitle="Approved transactions, last 6 months" />
          <div className="p-4">
            <BarsChart data={data.monthly} xKey="month" series={[{ key: "income", label: "Money in", color: "var(--chart-2)" }, { key: "spending", label: "Money out", color: "var(--chart-1)" }]} yFormat={(v) => naira(v, { compact: true })} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Where your money went" subtitle="Last 30 days" />
          <div className="p-4">
            {donut.length === 0 ? (
              <EmptyState title="No spending yet" body="Approved payments will appear here." />
            ) : (
              <>
                <DonutChart data={donut} center={{ label: "spent", value: naira(catTotal, { compact: true }) }} />
                <div className="mt-3"><Legend2 items={donut.map((d) => ({ name: d.name, color: d.color!, value: `${Math.round((d.value / catTotal) * 100)}%` }))} /></div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* recent + security */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Recent transactions" subtitle="Tap one to see its status and details" action={<LinkButton href="/bank/transactions" variant="ghost" size="sm">View all</LinkButton>} />
          <div className="p-2">
            {data.recent.length === 0 ? <EmptyState title="No transactions yet" body="Make your first payment and it will show up here." /> : data.recent.map((t) => <TxRow key={t.transactionId} t={t} />)}
          </div>
        </Card>

        <Card>
          <CardHeader title="Protection status" subtitle="How well your account is guarded" icon={<ShieldCheck size={16} />} />
          <ul className="space-y-1 p-3 text-sm">
            {[
              { ok: profile.kyc === "Verified", label: "Identity verified (KYC)", href: "/bank/profile" },
              { ok: !!profile.travelNoticeCountry, label: profile.travelNoticeCountry ? `Travel notice: ${profile.travelNoticeCountry}` : "No travel notice on file", href: "/bank/security", neutral: true },
              { ok: true, label: "Transaction PIN set", href: "/bank/security" },
              { ok: true, label: "Sensitive data encrypted (PGP)", href: "/bank/help" },
            ].map((r) => (
              <li key={r.label}>
                <Link href={r.href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brandsoft/60">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${r.ok ? "bg-successsoft text-success" : r.neutral ? "bg-surface2 text-muted" : "bg-warnsoft text-warn"}`}>{r.ok ? <Check size={14} /> : <ShieldAlert size={14} />}</span>
                  <span className="flex-1 text-ink2">{r.label}</span>
                  <Badge tone={r.ok ? "success" : r.neutral ? "neutral" : "warn"}>{r.ok ? "Good" : r.neutral ? "Optional" : "Action"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <FundModal open={fund} onClose={() => setFund(false)} accountId={account.accountId} onDone={() => { refresh(); refreshUnread(); reload(); }} />
    </div>
  );
}

function FundModal({ open, onClose, accountId, onDone }: { open: boolean; onClose: () => void; accountId: number; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("50000");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api("bank", "/bank/topup", { method: "POST", body: { accountId, amount: Number(amount), pin } });
      toast.success("Account funded", `${naira(Number(amount))} added to your balance.`);
      setPin("");
      onClose();
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Top-up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Fund your account (demo)" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={pin.length !== 4 || !Number(amount)}>Add money</Button></>}>
      <div className="space-y-4">
        <Alert tone="info">This simulates a card top-up so you have money to test with. It is recorded in the audit log.</Alert>
        <Field label="Amount (₦)"><Input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={!!err} /></Field>
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
    </Modal>
  );
}
