"use client";

import { Download, Filter, RotateCcw, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, Input, PageHeader, ScoreMeter, Select, StatusBadge, RiskBadge } from "@/components/ui/base";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApi, useDebounced } from "@/lib/hooks";
import { ApiError, downloadFile } from "@/lib/http";
import { dateTime, naira, num, pct, typeLabel } from "@/lib/format";
import type { Paged } from "@/lib/types";

interface Row {
  id: number; reference: string; customerId: number; customer: string; segment: string; type: string; status: string; amount: number;
  counterpartyDisplay: string; channel: string; country: string; city: string; score: number; tier: string; decision: string;
  ruleScore: number; ml: number; failed: number; total: number; createdAt: string;
}
type Res = Paged<Row> & { counts: { status: string; count: number }[] };

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "PendingReview", label: "Awaiting review" },
  { value: "Blocked", label: "Blocked" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Declined" },
];

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [tier, setTier] = useState("");
  const [type, setType] = useState("");
  const [rule, setRule] = useState(sp.get("rule") ?? "");
  const [sort, setSort] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const drule = useDebounced(rule.toUpperCase());

  const query = { status, tier, type, rule: drule, sort, q: dq, from, to, page, pageSize: 20 };
  const { data, error, loading, reload } = useApi<Res>("admin", "/admin/transactions", query, { poll: 20000 });

  const count = (s: string) => (s === "" ? data?.counts.reduce((a, b) => a + b.count, 0) : data?.counts.find((c) => c.status === s)?.count);
  const reset = () => { setStatus(""); setTier(""); setType(""); setRule(""); setSort(""); setQ(""); setFrom(""); setTo(""); setPage(1); };

  async function exportXlsx() {
    try {
      const { page: _p, pageSize: _s, sort: _o, ...filters } = query;
      void _p; void _s; void _o;
      await downloadFile("admin", "/admin/transactions/export", "transactions.xlsx", filters);
      toast.success("Excel export ready", "Your filters were applied.");
    } catch (e) {
      toast.error("Export failed", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions & cases"
        subtitle="Every screened transaction. Open one to see all rule checks, the model output and the full audit trail."
        actions={<Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={exportXlsx}>Export to Excel</Button>}
      />

      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={STATUS_TABS.map((t) => ({ ...t, count: data ? count(t.value) : undefined }))} />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="sm:col-span-2 xl:col-span-2"><Input icon={<Search size={15} />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Reference, customer, counterparty" /></div>
          <Select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }}>
            <option value="">All risk tiers</option><option>Low</option><option>Medium</option><option>High</option>
          </Select>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            <option value="Transfer">Transfer</option><option value="BillPayment">Bill payment</option><option value="Collection">Money request</option>
            <option value="CardPayment">Card payment</option><option value="AtmWithdrawal">ATM withdrawal</option>
          </Select>
          <Input value={rule} onChange={(e) => { setRule(e.target.value); setPage(1); }} placeholder="Rule code, e.g. GEO-04" />
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          <Select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Newest first</option><option value="oldest">Oldest first</option><option value="score">Highest risk</option><option value="amount">Largest amount</option>
          </Select>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><Filter size={13} /> {data ? `${num(data.total)} matching transactions` : "Loading..."}</span>
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={reset}>Clear filters</Button>
        </div>
      </Card>

      {loading && !data ? <PageLoader /> : error && !data ? <ErrorState message={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
        <Card><EmptyState title="No transactions match" body="Try clearing some filters." /></Card>
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <THead><tr><TH>Transaction</TH><TH>Customer</TH><TH>Amount</TH><TH>Rules</TH><TH>ML</TH><TH>Hybrid score</TH><TH>Tier</TH><TH>Status</TH><TH>When</TH></tr></THead>
              <tbody>
                {data.items.map((t) => (
                  <TR key={t.id} onClick={() => router.push(`/admin/transactions/${t.id}`)}>
                    <TD><p className="font-medium text-ink">{typeLabel(t.type)}</p><p className="font-mono text-[11px] text-muted">{t.reference}</p></TD>
                    <TD><p className="text-ink">{t.customer}</p><p className="text-xs text-muted">{t.segment} · {t.city || t.country}</p></TD>
                    <TD className="whitespace-nowrap font-semibold tabular-nums text-ink">{naira(t.amount)}</TD>
                    <TD className="whitespace-nowrap text-xs"><span className={t.failed ? "font-semibold text-danger" : "text-success"}>{t.failed} failed</span><span className="text-muted"> / {t.total}</span></TD>
                    <TD className="whitespace-nowrap tabular-nums text-xs">{pct(t.ml, 0)}</TD>
                    <TD><ScoreMeter score={t.score} tier={t.tier} compact /></TD>
                    <TD><RiskBadge tier={t.tier} /></TD>
                    <TD><StatusBadge status={t.status} /></TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{dateTime(t.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination page={page} pageSize={20} total={data.total} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<PageLoader />}><Inner /></Suspense>;
}
