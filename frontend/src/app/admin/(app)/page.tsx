"use client";

import { AlertOctagon, ArrowRight, Ban, BrainCircuit, CheckCheck, Download, Gauge, Hourglass, ListChecks, RefreshCw, Users, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BarsChart, CHART_COLORS, DonutChart, Legend2, TrendChart } from "@/components/charts/charts";
import { Badge, Button, Card, CardHeader, PageHeader, ScoreMeter, StatusBadge } from "@/components/ui/base";
import { StatCard, Table, TableWrap, TD, TH, THead, TR, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, downloadFile } from "@/lib/http";
import { naira, num, pct, timeAgo, typeLabel } from "@/lib/format";

interface Overview {
  days: number;
  kpis: { totalScreened: number; screenedToday: number; pendingReview: number; oldestPendingHours: number; blocked: number; approved: number; rejected: number; approvalRate: number; averageRiskScore: number; valueApproved: number; valueAtRisk: number; customers: number; activeRules: number; totalRules: number };
  series: { date: string; screened: number; approved: number; flagged: number; blocked: number; rejected: number; averageScore: number }[];
  tiers: { tier: string; count: number }[];
  byType: { type: string; count: number; averageScore: number; amount: number }[];
  histogram: { range: string; count: number }[];
  topRules: { code: string; name: string; category: string; count: number }[];
  ruleCategories: { category: string; count: number }[];
  alerts: { id: number; reference: string; customer: string; type: string; status: string; amount: number; score: number; tier: string; failed: number; createdAt: string }[];
  model: { training: Record<string, unknown>; metrics: Record<string, Record<string, unknown>> } | null;
}

const TIER_COLOR: Record<string, string> = { Low: "var(--success)", Medium: "var(--warn)", High: "var(--danger)" };

export default function AdminOverview() {
  const router = useRouter();
  const [days, setDays] = useState("14");
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Overview>("admin", "/admin/overview", { days });

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const k = data.kpis;
  const metrics = data.model?.metrics;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fraud operations overview"
        subtitle="Real-time view of what the hybrid framework is screening, blocking and holding for review."
        actions={
          <>
            <Tabs value={days} onChange={setDays} items={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>Refresh</Button>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={async () => { try { await downloadFile("admin", "/admin/transactions/export", "transactions.xlsx"); toast.success("Excel export ready"); } catch (e) { toast.error("Export failed", e instanceof ApiError ? e.message : undefined); } }}>Export to Excel</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Screened today" value={k.screenedToday} icon={<Zap size={18} />} tone="purple" hint={`${num(k.totalScreened)} all time`} />
        <Link href="/admin/transactions?status=PendingReview" className="block"><StatCard label="Awaiting review" value={k.pendingReview} icon={<Hourglass size={18} />} tone="warn" hint={k.pendingReview ? `oldest ${k.oldestPendingHours} h` : "queue is clear"} /></Link>
        <StatCard label={`Blocked (${data.days}d)`} value={k.blocked} icon={<Ban size={18} />} tone="danger" hint={`${naira(k.valueAtRisk, { compact: true })} value at risk`} />
        <StatCard label="Approval rate" value={k.approvalRate} format={(n) => `${n.toFixed(1)}%`} icon={<CheckCheck size={18} />} tone="success" hint={`${num(k.approved)} approved`} />
        <StatCard label="Average risk score" value={k.averageRiskScore} format={(n) => n.toFixed(1)} icon={<Gauge size={18} />} tone="blue" hint="0 safe · 100 risky" />
        <StatCard label="Value approved" value={k.valueApproved} format={(n) => naira(n, { compact: true })} icon={<Wallet size={18} />} tone="success" />
        <StatCard label="Active rules" value={k.activeRules} format={(n) => `${Math.round(n)} / ${k.totalRules}`} icon={<ListChecks size={18} />} tone="purple" hint="in the rules engine" />
        <StatCard label="Customers" value={k.customers} icon={<Users size={18} />} tone="blue" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Screening volume by outcome" subtitle={`Transactions per day, last ${data.days} days`} />
          <div className="p-4">
            <TrendChart data={data.series} xKey="date" stacked series={[
              { key: "approved", label: "Approved", color: "var(--success)" },
              { key: "flagged", label: "Held for review", color: "var(--warn)" },
              { key: "blocked", label: "Blocked", color: "var(--danger)" },
              { key: "rejected", label: "Declined", color: "var(--muted)" },
            ]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Risk tier distribution" subtitle="Hybrid score bands" />
          <div className="p-4">
            <DonutChart data={data.tiers.map((t) => ({ name: t.tier, value: t.count, color: TIER_COLOR[t.tier] }))} center={{ label: "screened", value: num(data.tiers.reduce((a, b) => a + b.count, 0)) }} />
            <div className="mt-3"><Legend2 items={data.tiers.map((t) => ({ name: t.tier, value: t.count, color: TIER_COLOR[t.tier] }))} /></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Most frequently failed rules" subtitle="Which checks are catching the most transactions" icon={<ListChecks size={16} />} action={<Link href="/admin/rules" className="text-xs font-medium text-brand hover:underline">Manage rules</Link>} />
          <div className="p-4">
            {data.topRules.length === 0 ? <EmptyState title="No rule failures in this period" /> : (
              <BarsChart data={data.topRules.map((r) => ({ name: r.code, count: r.count, label: r.name }))} xKey="name" series={[{ key: "count", label: "Times failed" }]} horizontal height={330} colorByIndex />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Risk score distribution" subtitle="How the hybrid scores are spread" />
          <div className="p-4">
            <BarsChart data={data.histogram} xKey="range" series={[{ key: "count", label: "Transactions" }]} cellColors={data.histogram.map((_, i) => (i <= 3 ? "var(--success)" : i <= 6 ? "var(--warn)" : "var(--danger)"))} height={330} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Alerts needing attention" subtitle="Held and blocked transactions, newest first" icon={<AlertOctagon size={16} />} action={<Link href="/admin/transactions?status=PendingReview" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Open queue <ArrowRight size={13} /></Link>} />
          {data.alerts.length === 0 ? <EmptyState title="No open alerts" body="Held and blocked transactions will appear here." /> : (
            <TableWrap>
              <Table>
                <THead><tr><TH>Transaction</TH><TH>Amount</TH><TH>Score</TH><TH>Status</TH><TH>When</TH></tr></THead>
                <tbody>
                  {data.alerts.map((a) => (
                    <TR key={a.id} onClick={() => router.push(`/admin/transactions/${a.id}`)}>
                      <TD><p className="font-medium text-ink">{a.customer}</p><p className="text-xs text-muted">{typeLabel(a.type)} · {a.failed} rules failed</p></TD>
                      <TD className="whitespace-nowrap font-semibold tabular-nums text-ink">{naira(a.amount)}</TD>
                      <TD><ScoreMeter score={a.score} tier={a.tier} compact /></TD>
                      <TD><StatusBadge status={a.status} /></TD>
                      <TD className="whitespace-nowrap text-xs text-muted">{timeAgo(a.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="By transaction type" />
            <TableWrap>
              <Table>
                <THead><tr><TH>Type</TH><TH>Count</TH><TH>Avg score</TH></tr></THead>
                <tbody>
                  {data.byType.map((t) => (
                    <TR key={t.type}><TD className="font-medium text-ink">{typeLabel(t.type)}</TD><TD className="tabular-nums">{num(t.count)}</TD><TD><ScoreMeter score={Math.round(t.averageScore)} compact /></TD></TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>
          <Card>
            <CardHeader title="Rule families" subtitle="Share of failures by category" />
            <div className="p-4"><BarsChart data={data.ruleCategories} xKey="category" series={[{ key: "count", label: "Failures" }]} horizontal height={220} cellColors={CHART_COLORS} /></div>
          </Card>
        </div>
      </div>

      {metrics && (
        <Card>
          <CardHeader title="Machine learning layer" subtitle="Held-out test set, fraud probability threshold 0.5" icon={<BrainCircuit size={16} />} action={<Link href="/admin/model" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Full evaluation <ArrowRight size={13} /></Link>} />
          <TableWrap>
            <Table>
              <THead><tr><TH>Model</TH><TH>Precision</TH><TH>Recall</TH><TH>F1</TH><TH>False positive rate</TH></tr></THead>
              <tbody>
                {[["logistic_regression", "Logistic regression"], ["decision_tree", "Decision tree"], ["hybrid_combined", "Average of both (ML layer)"]].map(([k2, label]) => {
                  const m = metrics[k2] as Record<string, number>;
                  return <TR key={k2}><TD className="font-medium text-ink">{label} {k2 === "hybrid_combined" && <Badge tone="purple">used</Badge>}</TD><TD className="tabular-nums">{pct(m.precision)}</TD><TD className="tabular-nums">{pct(m.recall)}</TD><TD className="tabular-nums">{m.f1_score.toFixed(3)}</TD><TD className="tabular-nums">{pct(m.false_positive_rate, 2)}</TD></TR>;
                })}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
