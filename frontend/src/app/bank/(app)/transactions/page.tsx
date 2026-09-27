"use client";

import { Filter, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TxIcon } from "@/components/bank/tx";
import { Card, Input, PageHeader, Select, StatusBadge } from "@/components/ui/base";
import { Pagination, Table, TableWrap, TD, TH, THead, TR, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi, useDebounced } from "@/lib/hooks";
import { dateTime, naira, typeLabel } from "@/lib/format";
import type { Paged, TxListItem } from "@/lib/types";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "Approved", label: "Approved" },
  { value: "PendingReview", label: "Held" },
  { value: "Blocked", label: "Blocked" },
  { value: "Rejected", label: "Declined" },
];

export default function TransactionsPage() {
  const router = useRouter();
  const [init] = useState(() => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""));
  const [q, setQ] = useState(init.get("q") ?? "");
  const [status, setStatus] = useState(init.get("status") ?? "");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  const { data, error, loading, reload } = useApi<Paged<TxListItem>>("bank", "/bank/transactions", { q: dq, status, type, from, to, page, pageSize: 12 });
  const hasFilter = q || status || type || from || to;

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Every payment you have made or requested. Open one to see its status and full details." />

      <Card className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={STATUS_TABS} />
          {hasFilter && (
            <button onClick={() => { setQ(""); setStatus(""); setType(""); setFrom(""); setTo(""); setPage(1); }} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input icon={<Search size={15} />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, reference..." className="h-10" />
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="h-10">
            <option value="">All types</option>
            {["Transfer", "BillPayment", "CardPayment", "AtmWithdrawal", "Collection"].map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-10" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-10" aria-label="To date" />
        </div>
      </Card>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No transactions found" body={hasFilter ? "Try clearing some filters." : "Your payments will show up here."} icon={<Filter size={22} />} />
        ) : (
          data && (
            <>
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Transaction</TH>
                      <TH>Amount</TH>
                      <TH>Status</TH>
                      <TH>Channel</TH>
                      <TH>Location</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {data.items.map((t) => (
                      <TR key={t.transactionId} onClick={() => router.push(`/bank/transactions/${t.transactionId}`)}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <TxIcon type={t.type} size={38} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-ink">{t.counterpartyDisplay}</p>
                              <p className="text-xs text-muted">{typeLabel(t.type)} · {dateTime(t.createdAt)}</p>
                            </div>
                          </div>
                        </TD>
                        <TD className="whitespace-nowrap font-semibold tabular-nums text-ink">{t.type === "Collection" ? "+" : "-"}{naira(t.amount)}</TD>
                        <TD><StatusBadge status={t.status} /></TD>
                        <TD className="text-xs text-muted">{t.channel}</TD>
                        <TD className="whitespace-nowrap text-xs text-muted">{t.city ? `${t.city}, ${t.country}` : "-"}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination page={page} pageSize={12} total={data.total} onPage={setPage} />
            </>
          )
        )}
      </Card>
    </div>
  );
}
