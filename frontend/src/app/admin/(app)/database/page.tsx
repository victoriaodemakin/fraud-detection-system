"use client";

import { Archive, Database, Download, HardDriveDownload, Loader2, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Alert, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/base";
import { DefRow, StatCard, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api, downloadFile } from "@/lib/http";
import { dateTime, num } from "@/lib/format";

interface Info {
  provider: string; file: string; sizeBytes: number; applied: string[]; pending: string[]; encryption: string;
  tables: { name: string; rows: number; columns: number; indexes: number }[];
  backups: { name: string; sizeBytes: number; createdAt: string }[];
}

const kb = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`);

export default function DatabasePage() {
  const toast = useToast();
  const { isAdmin } = useAdmin();
  const { data, error, loading, reload } = useApi<Info>("admin", isAdmin ? "/admin/database" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  if (!isAdmin) return <Alert tone="warn" title="Administrators only">Database management is limited to the Admin role.</Alert>;
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); reload(); } catch (e) { toast.error("Action failed", e instanceof ApiError ? e.message : undefined); } finally { setBusy(null); }
  }

  const totalRows = data.tables.reduce((a, t) => a + t.rows, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Database" subtitle="The managed SQL store behind the bank: EF Core migrations, backups, integrity checks and maintenance." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tables" value={data.tables.length} icon={<Database size={18} />} tone="purple" />
        <StatCard label="Rows stored" value={totalRows} icon={<Archive size={18} />} tone="blue" />
        <StatCard label="File size" value={kb(data.sizeBytes)} icon={<HardDriveDownload size={18} />} tone="success" hint={data.file} />
        <StatCard label="Migrations" value={`${data.applied.length} applied`} icon={<Wrench size={18} />} tone={data.pending.length ? "warn" : "success"} hint={data.pending.length ? `${data.pending.length} pending` : "up to date"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Tables" subtitle={data.provider} icon={<Database size={16} />} />
          <TableWrap>
            <Table>
              <THead><tr><TH>Table</TH><TH>Rows</TH><TH>Columns</TH><TH>Indexes</TH></tr></THead>
              <tbody>{data.tables.map((t) => <TR key={t.name}><TD className="font-mono text-xs text-ink">{t.name}</TD><TD className="tabular-nums">{num(t.rows)}</TD><TD>{t.columns}</TD><TD>{t.indexes}</TD></TR>)}</tbody>
            </Table>
          </TableWrap>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Maintenance" icon={<Wrench size={16} />} />
            <div className="space-y-2.5 p-5">
              <Button className="w-full" variant="secondary" icon={busy === "backup" ? <Loader2 size={15} className="animate-spin" /> : <Archive size={15} />} onClick={() => run("backup", async () => { const r = await api<{ name: string }>("admin", "/admin/database/backup", { method: "POST" }); toast.success("Backup created", r.name); })}>Create backup</Button>
              <Button className="w-full" variant="secondary" icon={<ShieldCheck size={15} />} loading={busy === "integrity"} onClick={() => run("integrity", async () => { const r = await api<{ integrity: string[]; foreignKeyViolations: number }>("admin", "/admin/database/integrity", { method: "POST" }); setReport(`Integrity: ${r.integrity.join(", ")} · foreign-key violations: ${r.foreignKeyViolations}`); })}>Run integrity check</Button>
              <Button className="w-full" variant="secondary" icon={<Wrench size={15} />} loading={busy === "opt"} onClick={() => run("opt", async () => { const r = await api<{ before: number; after: number }>("admin", "/admin/database/optimize", { method: "POST" }); setReport(`Optimised: ${kb(r.before)} → ${kb(r.after)}`); })}>Optimise (ANALYZE + VACUUM)</Button>
              <Button className="w-full" variant="secondary" icon={<Sparkles size={15} />} loading={busy === "seed"} onClick={() => run("seed", async () => { const r = await api<{ message: string }>("admin", "/admin/database/seed-demo", { method: "POST" }); toast.info("Demo data", r.message); })}>Generate demo history</Button>
              {report && <Alert tone="success">{report}</Alert>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Security" icon={<ShieldCheck size={16} />} />
            <div className="p-5 text-sm text-ink2">{data.encryption}</div>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Migrations" subtitle="Schema history managed by EF Core" />
          <ul className="divide-y divide-line">
            {data.applied.map((m) => <li key={m} className="flex items-center justify-between px-5 py-2.5 text-sm"><span className="font-mono text-xs text-ink">{m}</span><Badge tone="success">Applied</Badge></li>)}
            {data.pending.map((m) => <li key={m} className="flex items-center justify-between px-5 py-2.5 text-sm"><span className="font-mono text-xs text-ink">{m}</span><Badge tone="warn">Pending</Badge></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Backups" subtitle="Consistent snapshots (VACUUM INTO)" icon={<Archive size={16} />} />
          {data.backups.length === 0 ? <p className="p-5 text-sm text-muted">No backups yet.</p> : (
            <ul className="divide-y divide-line">
              {data.backups.map((b) => (
                <li key={b.name} className="flex items-center justify-between px-5 py-3">
                  <div><p className="font-mono text-xs text-ink">{b.name}</p><p className="text-xs text-muted">{kb(b.sizeBytes)} · {dateTime(b.createdAt)}</p></div>
                  <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadFile("admin", `/admin/database/backups/${b.name}`, b.name).catch(() => toast.error("Download failed"))}>Download</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <DefRow label="Database file">{data.file}</DefRow>
    </div>
  );
}
