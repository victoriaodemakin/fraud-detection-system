"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Badge, Card, Input, PageHeader, ScoreMeter, Select } from "@/components/ui/base";
import { Pagination, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useApi, useDebounced } from "@/lib/hooks";
import { naira, num, timeAgo } from "@/lib/format";
import type { Paged } from "@/lib/types";

interface Row {
  id: number; fullName: string; email: string; phone: string; segment: string; kyc: string; status: string; createdAt: string;
  balance: number; transactions: number; averageScore: number; flagged: number; blocked: number; lastActivity: string | null;
}

export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [kyc, setKyc] = useState("");
  const [segment, setSegment] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useApi<Paged<Row>>("admin", "/admin/customers", { q: dq, kyc, segment, page, pageSize: 20 });

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle="Everyone who has onboarded, with their behaviour and risk profile." />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input icon={<Search size={15} />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, email or phone" />
          <Select value={kyc} onChange={(e) => { setKyc(e.target.value); setPage(1); }}><option value="">All KYC states</option><option>Verified</option><option>Pending</option><option>Mismatch</option></Select>
          <Select value={segment} onChange={(e) => { setSegment(e.target.value); setPage(1); }}><option value="">All segments</option><option>Standard</option><option>Premium</option><option>Student</option></Select>
        </div>
      </Card>

      {loading && !data ? <PageLoader /> : error && !data ? <ErrorState message={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
        <Card><EmptyState title="No customers found" /></Card>
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <THead><tr><TH>Customer</TH><TH>Segment</TH><TH>KYC</TH><TH>Balance</TH><TH>Transactions</TH><TH>Avg risk</TH><TH>Held / blocked</TH><TH>Last activity</TH></tr></THead>
              <tbody>
                {data.items.map((c) => (
                  <TR key={c.id} onClick={() => router.push(`/admin/customers/${c.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.fullName} size={34} />
                        <div><p className="font-medium text-ink">{c.fullName} {c.status !== "Active" && <Badge tone="danger">{c.status}</Badge>}</p><p className="text-xs text-muted">{c.email}</p></div>
                      </div>
                    </TD>
                    <TD>{c.segment}</TD>
                    <TD><Badge tone={c.kyc === "Verified" ? "success" : c.kyc === "Pending" ? "warn" : "danger"}>{c.kyc}</Badge></TD>
                    <TD className="whitespace-nowrap tabular-nums">{naira(c.balance)}</TD>
                    <TD className="tabular-nums">{num(c.transactions)}</TD>
                    <TD><ScoreMeter score={Math.round(c.averageScore)} compact /></TD>
                    <TD className="whitespace-nowrap text-xs"><span className="font-semibold text-warn">{c.flagged}</span> / <span className="font-semibold text-danger">{c.blocked}</span></TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{c.lastActivity ? timeAgo(c.lastActivity) : "-"}</TD>
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
