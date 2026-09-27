"use client";

import { Download, ListChecks, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Alert, Drawer, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Switch } from "@/components/ui/base";
import { Progress, StatCard, Table, TableWrap, TD, TH, THead, TR, Tabs } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api, downloadFile } from "@/lib/http";
import { dateTime, num } from "@/lib/format";

interface RuleRow {
  code: string; category: string; name: string; description: string; points: number; action: string; enabled: boolean; updatedAt: string; updatedBy: string;
  defaultPoints: number; parameters: { key: string; label: string; unit: string; value: string; default: string }[];
  evaluated30d: number; triggered30d: number; triggerRate: number;
}
interface Res { rules: RuleRow[]; risk: { ruleWeight: number; mlWeight: number; lowMax: number; mediumMax: number } }

export default function RulesPage() {
  const toast = useToast();
  const { isAdmin } = useAdmin();
  const { data, error, loading, reload } = useApi<Res>("admin", "/admin/rules");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<RuleRow | null>(null);
  const [form, setForm] = useState<{ enabled: boolean; points: string; params: Record<string, string> }>({ enabled: true, points: "0", params: {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cats = useMemo(() => Array.from(new Set(data?.rules.map((r) => r.category) ?? [])), [data]);
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const rows = data.rules.filter((r) => (cat === "all" || r.category === cat) && (!q || (r.code + r.name + r.description).toLowerCase().includes(q.toLowerCase())));
  const enabled = data.rules.filter((r) => r.enabled).length;
  const hard = data.rules.filter((r) => r.action.toLowerCase().includes("block")).length;

  function openEdit(r: RuleRow) {
    setEdit(r);
    setErr(null);
    setForm({ enabled: r.enabled, points: String(r.points), params: Object.fromEntries(r.parameters.map((p) => [p.key, p.value])) });
  }

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErr(null);
    try {
      await api("admin", `/admin/rules/${edit.code}`, { method: "PUT", body: { enabled: form.enabled, points: Number(form.points), parameters: form.params } });
      toast.success(`${edit.code} updated`, "New transactions use the new settings straight away.");
      setEdit(null);
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!edit) return;
    await api("admin", `/admin/rules/${edit.code}/reset`, { method: "POST" });
    toast.info(`${edit.code} reset to defaults`);
    setEdit(null);
    reload();
  }

  async function toggle(r: RuleRow, on: boolean) {
    if (!isAdmin) return;
    try {
      await api("admin", `/admin/rules/${r.code}`, { method: "PUT", body: { enabled: on, points: r.points, parameters: Object.fromEntries(r.parameters.map((p) => [p.key, p.value])) } });
      reload();
    } catch (e) {
      toast.error("Could not update", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rules engine"
        subtitle="The configurable Layer 1 of the framework. Each failed rule adds its points to the rule score (capped at 100)."
        actions={<Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={async () => { try { await downloadFile("admin", "/admin/rules/export", "rules-engine.xlsx"); toast.success("Excel export ready"); } catch { toast.error("Export failed"); } }}>Export to Excel</Button>}
      />
      {!isAdmin && <Alert tone="info">You are signed in as an analyst. Rules are read-only; an administrator can change thresholds and points.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rules in catalogue" value={data.rules.length} icon={<ListChecks size={18} />} tone="purple" />
        <StatCard label="Enabled" value={enabled} tone="success" hint={`${data.rules.length - enabled} disabled`} />
        <StatCard label="Categories" value={cats.length} tone="blue" />
        <StatCard label="Hard-block rules" value={hard} tone="danger" hint="stop a payment outright" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={cat} onChange={setCat} items={[{ value: "all", label: "All", count: data.rules.length }, ...cats.map((c) => ({ value: c, label: c, count: data.rules.filter((r) => r.category === c).length }))]} />
          <div className="w-full lg:w-72"><Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules" /></div>
        </div>
      </Card>

      <Card>
        <TableWrap>
          <Table>
            <THead><tr><TH>Rule</TH><TH>Category</TH><TH>Points</TH><TH>Action</TH><TH>Last 30 days</TH><TH>Enabled</TH></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.code} onClick={() => openEdit(r)} className={r.enabled ? "" : "opacity-60"}>
                  <TD>
                    <p className="flex items-center gap-2 font-medium text-ink"><span className="rounded-md bg-brandsoft px-1.5 py-0.5 font-mono text-[11px] text-brand">{r.code}</span>{r.name}</p>
                    <p className="mt-0.5 max-w-xl text-xs text-muted">{r.description}</p>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{r.category}</TD>
                  <TD className="tabular-nums font-semibold text-ink">{r.points}{r.points !== r.defaultPoints && <span className="ml-1 text-[10px] font-normal text-warn">(default {r.defaultPoints})</span>}</TD>
                  <TD><Badge tone={r.action.toLowerCase().includes("block") ? "danger" : "neutral"}>{r.action}</Badge></TD>
                  <TD className="min-w-40">
                    <div className="flex items-center justify-between text-xs"><span>{num(r.triggered30d)} / {num(r.evaluated30d)}</span><span className="font-semibold text-ink">{r.triggerRate}%</span></div>
                    <Progress value={Math.min(100, r.triggerRate * 4)} tone={r.triggerRate > 15 ? "warn" : "brand"} />
                  </TD>
                  <TD><span onClick={(e) => e.stopPropagation()}><Switch checked={r.enabled} disabled={!isAdmin} onChange={(v) => toggle(r, v)} /></span></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <p className="text-xs text-muted">
        Want to know how good each rule is at catching fraud? See per-rule effectiveness on the <Link href="/admin/model" className="font-medium text-brand hover:underline">Model performance</Link> page.
      </p>

      <Drawer
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit ? `${edit.code} · ${edit.name}` : ""}
        subtitle={edit?.category}
        footer={isAdmin ? <><Button variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>Reset to default</Button><Button loading={busy} onClick={save}>Save changes</Button></> : <Button variant="ghost" onClick={() => setEdit(null)}>Close</Button>}
      >
        {edit && (
          <div className="space-y-4">
            <p className="text-sm text-ink2">{edit.description}</p>
            <div className="flex items-center justify-between rounded-xl border border-line p-3"><span className="text-sm font-medium text-ink">Rule enabled</span><Switch checked={form.enabled} disabled={!isAdmin} onChange={(v) => setForm({ ...form, enabled: v })} /></div>
            <Field label="Points added when the rule fails (0 to 100)"><Input type="number" min={0} max={100} disabled={!isAdmin} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></Field>
            {edit.parameters.map((p) => (
              <Field key={p.key} label={`${p.label}${p.unit ? ` (${p.unit})` : ""}`} hint={`Default: ${p.default}`}>
                <Input disabled={!isAdmin} value={form.params[p.key] ?? ""} onChange={(e) => setForm({ ...form, params: { ...form.params, [p.key]: e.target.value } })} />
              </Field>
            ))}
            <p className="text-xs text-muted">Last updated {dateTime(edit.updatedAt)} by {edit.updatedBy || "system"}</p>
            {err && <p className="text-xs text-danger">{err}</p>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
