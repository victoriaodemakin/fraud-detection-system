"use client";

import { Plus, Save, Scale, ShieldBan, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Alert, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui/base";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { dateTime } from "@/lib/format";

interface Risk { ruleWeight: number; mlWeight: number; lowMax: number; mediumMax: number; studentMultiplier: number; standardMultiplier: number; premiumMultiplier: number }
interface Rules { risk: Risk }
interface Ip { id: number; ip: string; kind: string; reason: string; addedAt: string }

export default function SettingsPage() {
  const toast = useToast();
  const { isAdmin, user } = useAdmin();
  const { data, error, loading, reload } = useApi<Rules>("admin", "/admin/rules");
  const { data: ips, reload: reloadIps } = useApi<Ip[]>("admin", "/admin/blacklist");
  const [f, setF] = useState<Record<keyof Risk, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState("");
  const [kind, setKind] = useState("VPN");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (data) setF(Object.fromEntries(Object.entries(data.risk).map(([k, v]) => [k, String(v)])) as Record<keyof Risk, string>);
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!f) return null;

  const set = (k: keyof Risk, v: string) => setF({ ...f, [k]: v });
  const sum = Number(f.ruleWeight) + Number(f.mlWeight);

  async function save() {
    if (!f) return;
    setBusy(true);
    try {
      await api("admin", "/admin/settings", { method: "PUT", body: { ruleWeight: Number(f.ruleWeight), mlWeight: Number(f.mlWeight), lowMax: Number(f.lowMax), mediumMax: Number(f.mediumMax), studentMultiplier: Number(f.studentMultiplier), standardMultiplier: Number(f.standardMultiplier), premiumMultiplier: Number(f.premiumMultiplier) } });
      toast.success("Risk settings saved", "Applied to every new transaction and recorded in the audit log.");
      reload();
    } catch (e) {
      toast.error("Not saved", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function addIp() {
    try {
      await api("admin", "/admin/blacklist", { method: "POST", body: { ip, kind, reason } });
      setIp(""); setReason("");
      toast.success("IP blacklisted");
      reloadIps();
    } catch (e) {
      toast.error("Could not add", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="How the two layers are combined, where the tier boundaries sit, and which IP addresses are blacklisted." />
      {!isAdmin && <Alert tone="info">You are signed in as an analyst ({user.username}). Settings are read-only.</Alert>}

      <Card>
        <CardHeader title="Hybrid risk score" subtitle="risk = rule weight × rule score + ML weight × (ML probability × 100)" icon={<Scale size={16} />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rule weight"><Input type="number" step="0.05" min={0} max={1} disabled={!isAdmin} value={f.ruleWeight} onChange={(e) => set("ruleWeight", e.target.value)} /></Field>
          <Field label="ML weight" error={Math.abs(sum - 1) > 0.001 ? "The two weights must add up to 1." : null}><Input type="number" step="0.05" min={0} max={1} disabled={!isAdmin} value={f.mlWeight} onChange={(e) => set("mlWeight", e.target.value)} /></Field>
          <Field label="Low tier up to (score)" hint="Approve"><Input type="number" disabled={!isAdmin} value={f.lowMax} onChange={(e) => set("lowMax", e.target.value)} /></Field>
          <Field label="Medium tier up to (score)" hint="Hold for review. Above this the payment is blocked."><Input type="number" disabled={!isAdmin} value={f.mediumMax} onChange={(e) => set("mediumMax", e.target.value)} /></Field>
        </div>
        <div className="border-t border-line p-5">
          <p className="mb-3 text-sm font-medium text-ink">Segment multipliers for amount rules</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Student"><Input type="number" step="0.1" disabled={!isAdmin} value={f.studentMultiplier} onChange={(e) => set("studentMultiplier", e.target.value)} /></Field>
            <Field label="Standard"><Input type="number" step="0.1" disabled={!isAdmin} value={f.standardMultiplier} onChange={(e) => set("standardMultiplier", e.target.value)} /></Field>
            <Field label="Premium"><Input type="number" step="0.1" disabled={!isAdmin} value={f.premiumMultiplier} onChange={(e) => set("premiumMultiplier", e.target.value)} /></Field>
          </div>
        </div>
        {isAdmin && <div className="flex justify-end border-t border-line bg-soft px-5 py-3"><Button icon={<Save size={15} />} loading={busy} onClick={save}>Save settings</Button></div>}
      </Card>

      <Card>
        <CardHeader title="IP blacklist" subtitle="Feeds rule DEV-03 (blacklisted IP, VPN or Tor exit node)" icon={<ShieldBan size={16} />} />
        {isAdmin && (
          <div className="grid gap-3 border-b border-line p-5 sm:grid-cols-[1fr_140px_1.5fr_auto]">
            <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IP address" />
            <Select value={kind} onChange={(e) => setKind(e.target.value)}><option>VPN</option><option>Proxy</option><option>Tor</option><option>Fraud</option></Select>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <Button icon={<Plus size={15} />} onClick={addIp} disabled={!ip}>Add</Button>
          </div>
        )}
        <TableWrap>
          <Table>
            <THead><tr><TH>IP</TH><TH>Kind</TH><TH>Reason</TH><TH>Added</TH><TH>{""}</TH></tr></THead>
            <tbody>
              {(ips ?? []).map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs text-ink">{b.ip}</TD><TD><Badge>{b.kind}</Badge></TD><TD className="text-xs">{b.reason || "-"}</TD><TD className="text-xs text-muted">{dateTime(b.addedAt)}</TD>
                  <TD>{isAdmin && <button onClick={async () => { await api("admin", `/admin/blacklist/${b.id}`, { method: "DELETE" }); reloadIps(); }} className="rounded-lg p-1.5 text-muted hover:bg-dangersoft hover:text-danger" aria-label="Remove"><Trash2 size={15} /></button>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
