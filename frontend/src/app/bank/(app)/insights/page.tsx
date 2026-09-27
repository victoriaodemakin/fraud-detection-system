"use client";

import { Hourglass, ShieldCheck, TrendingUp, XCircle } from "lucide-react";
import { BarsChart, CHART_COLORS, DonutChart, Legend2, TrendChart } from "@/components/charts/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui/base";
import { StatCard } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useApi } from "@/lib/hooks";
import { naira } from "@/lib/format";

interface Insights {
  byCategory: { category: string; amount: number; count: number }[];
  topPayees: { name: string; amount: number; count: number }[];
  daily: { date: string; amount: number }[];
  outcomes: { approved: number; underReview: number; notCompleted: number };
  total: number;
}

export default function InsightsPage() {
  const { data, error, loading, reload } = useApi<Insights>("bank", "/bank/insights");
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const donut = data.byCategory.slice(0, 6).map((c, i) => ({ name: c.category, value: c.amount, color: CHART_COLORS[i % 5] }));
  const total = data.byCategory.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Spending insights" subtitle="A 90-day look at where your money goes." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Spent (90 days)" value={data.total} format={(n) => naira(n, { compact: true })} icon={<TrendingUp size={18} />} tone="purple" />
        <StatCard label="Successful payments" value={data.outcomes.approved} icon={<ShieldCheck size={18} />} tone="success" />
        <StatCard label="Under review" value={data.outcomes.underReview} icon={<Hourglass size={18} />} tone="warn" />
        <StatCard label="Not completed" value={data.outcomes.notCompleted} icon={<XCircle size={18} />} tone="danger" />
      </div>

      <Card>
        <CardHeader title="Daily spending" subtitle="Last 30 days, approved payments only" />
        <div className="p-4"><TrendChart data={data.daily} xKey="date" series={[{ key: "amount", label: "Spent", color: "var(--chart-1)" }]} yFormat={(v) => naira(v, { compact: true })} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Spending by category" />
          <div className="p-4">
            {donut.length === 0 ? <EmptyState title="No spending yet" /> : (
              <>
                <DonutChart data={donut} center={{ label: "total", value: naira(total, { compact: true }) }} />
                <div className="mt-3"><Legend2 items={donut.map((d) => ({ name: d.name, color: d.color!, value: naira(d.value, { compact: true }) }))} /></div>
              </>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Top payees" subtitle="By amount sent" />
          <div className="p-4">
            {data.topPayees.length === 0 ? <EmptyState title="No payees yet" /> : (
              <BarsChart data={data.topPayees.map((p) => ({ ...p, name: p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name }))} xKey="name" series={[{ key: "amount", label: "Sent" }]} horizontal yFormat={(v) => naira(v, { compact: true })} colorByIndex height={280} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
