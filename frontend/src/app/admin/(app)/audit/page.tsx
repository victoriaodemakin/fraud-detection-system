"use client";

import { Download, FileClock, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui/base";
import { Pagination, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useApi, useDebounced } from "@/lib/hooks";
import { ApiError, downloadFile } from "@/lib/http";
import { dateTime, num } from "@/lib/format";

interface Log { id: number; createdAt: string; actor: string; actorRole: string; action: string; entityType: string; entityId: string; detail: string }
interface Res { total: number; page: number; pageSize: number; items: Log[]; actions: string[] }

const TONE: Record<string, "success" | "warn" | "danger" | "info" | "purple" | "neutral"> = {
  TransactionReviewed: "purple", SensitiveDataDecrypted: "warn", RuleUpdated: "info", RuleReset: "info", RiskSettingsUpdated: "info", CustomerSuspended: "danger",
  AuditLogExported: "neutral", DatabaseBackup: "success", TransactionEscalated: "warn", NoteAdded: "neutral",
};

export default function AuditPage() {
  const toast = useToast();
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const dq = useDebounced(q);
  const dactor = useDebounced(actor);
  const filters = { actor: dactor, action, role, q: dq, from, to };
  const { data, error, loading, reload } = useApi<Res>("admin", "/admin/audit", { ...filters, page, pageSize: 25 });

  async function exportXlsx() {
    setExporting(true);
    try {
      await downloadFile("admin", "/admin/audit/export", `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`, filters);
      toast.success("Audit log exported", "The Excel file honours the filters you selected.");
      reload();
    } catch (e) {
      toast.error("Export failed", e instanceof ApiError ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  }

  const clear = () => { setActor(""); setAction(""); setRole(""); setQ(""); setFrom(""); setTo(""); setPage(1); };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        subtitle="An immutable record of every analyst decision, note, configuration change and access to protected data."
        actions={<Button icon={<Download size={15} />} loading={exporting} onClick={exportXlsx}>Export to Excel</Button>}
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2"><Input icon={<Search size={15} />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search detail or entity id" /></div>
          <Input value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} placeholder="Actor" />
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{data?.actions.map((a) => <option key={a}>{a}</option>)}</Select>
          <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option>Admin</option><option>Analyst</option><option>Customer</option><option>System</option></Select>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From" /><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To" /></div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><FileClock size={13} /> {data ? `${num(data.total)} entries` : "Loading..."}</span>
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={clear}>Clear filters</Button>
        </div>
      </Card>

      {loading && !data ? <PageLoader /> : error && !data ? <ErrorState message={error} onRetry={reload} /> : !data || data.items.length === 0 ? (
        <Card><EmptyState title="No audit entries match" /></Card>
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <THead><tr><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Detail</TH></tr></THead>
              <tbody>
                {data.items.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-xs text-muted">{dateTime(l.createdAt)}</TD>
                    <TD className="whitespace-nowrap"><p className="text-ink">{l.actor}</p><p className="text-[11px] text-muted">{l.actorRole}</p></TD>
                    <TD><Badge tone={TONE[l.action] ?? "neutral"}>{l.action}</Badge></TD>
                    <TD className="whitespace-nowrap text-xs">{l.entityType} <span className="font-mono text-muted">{l.entityId}</span></TD>
                    <TD className="max-w-md text-xs">{l.detail}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination page={page} pageSize={25} total={data.total} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}
