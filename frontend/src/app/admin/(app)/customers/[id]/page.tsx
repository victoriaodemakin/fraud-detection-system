"use client";

import { ArrowLeft, Ban, Fingerprint, History, Laptop, Link2, LogIn, PauseCircle, PlayCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { Alert, ErrorState, Modal, PageLoader } from "@/components/ui/feedback";
import { Avatar, Badge, Button, Card, CardHeader, Field, PageHeader, RiskBadge, ScoreMeter, StatusBadge, Textarea } from "@/components/ui/base";
import { DefRow, StatCard, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { dateOnly, dateTime, naira, timeAgo, typeLabel } from "@/lib/format";

interface Detail {
  profile: { id: number; fullName: string; email: string; phone: string; address: string; segment: string; kyc: string; nameOnId: string; bvnLast4: string | null; status: string; createdAt: string; homeCountry: string; homeCity: string; travelNoticeCountry: string | null; travelNoticeUntil: string | null };
  accounts: { id: number; masked: string; type: string; balance: number; createdAt: string; lastActivityAt: string }[];
  stats: { transactions: number; approved: number; flagged: number; blocked: number; rejected: number; averageScore: number; maxScore: number; volume: number };
  transactions: { id: number; reference: string; type: string; status: string; amount: number; counterpartyDisplay: string; country: string; city: string; score: number; tier: string; failed: number; createdAt: string }[];
  devices: { id: number; label: string; fingerprint: string; firstSeenAt: string; lastSeenAt: string; trusted: boolean }[];
  logins: { id: number; success: boolean; ip: string; country: string; city: string; deviceFingerprint: string; simulated: boolean; createdAt: string }[];
  changes: { id: number; field: string; detail: string; changedAt: string }[];
  linkedCustomers: { id: number; fullName: string }[];
  beneficiaries: number;
}

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAdmin();
  const { data, error, loading, reload } = useApi<Detail>("admin", `/admin/customers/${id}`);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { profile: p, stats: s } = data;
  const suspended = p.status !== "Active";

  async function toggle() {
    setBusy(true);
    try {
      await api("admin", `/admin/customers/${id}/status`, { method: "POST", body: { status: suspended ? "Active" : "Suspended", reason } });
      toast.success(suspended ? "Account reactivated" : "Account suspended");
      setOpen(false);
      setReason("");
      reload();
    } catch (e) {
      toast.error("Could not change status", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"><ArrowLeft size={15} /> All customers</Link>}
        title={<span className="flex items-center gap-3"><Avatar name={p.fullName} size={44} />{p.fullName} {suspended && <Badge tone="danger">{p.status}</Badge>}</span>}
        subtitle={`${p.email} · ${p.phone} · customer since ${dateOnly(p.createdAt)}`}
        actions={isAdmin && <Button variant={suspended ? "success" : "danger"} size="sm" icon={suspended ? <PlayCircle size={14} /> : <PauseCircle size={14} />} onClick={() => setOpen(true)}>{suspended ? "Reactivate account" : "Suspend account"}</Button>}
      />

      {data.linkedCustomers.length > 0 && (
        <Alert tone="warn" title="Shared phone number">
          Also used by: {data.linkedCustomers.map((l, i) => <span key={l.id}>{i > 0 && ", "}<Link href={`/admin/customers/${l.id}`} className="font-medium underline">{l.fullName}</Link></span>)}. This is what rule PRO-03 looks for.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transactions" value={s.transactions} tone="purple" icon={<History size={18} />} hint={`${s.approved} approved`} />
        <StatCard label="Held / blocked" value={`${s.flagged} / ${s.blocked}`} tone="warn" icon={<Ban size={18} />} hint={`${s.rejected} declined`} />
        <StatCard label="Average risk score" value={s.averageScore} format={(n) => n.toFixed(1)} tone="blue" icon={<Fingerprint size={18} />} hint={`peak ${s.maxScore}`} />
        <StatCard label="Approved volume" value={s.volume} format={(n) => naira(n, { compact: true })} tone="success" icon={<Wallet size={18} />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Profile" />
            <div className="p-5">
              <DefRow label="Segment">{p.segment}</DefRow>
              <DefRow label="KYC"><Badge tone={p.kyc === "Verified" ? "success" : "warn"}>{p.kyc}</Badge></DefRow>
              <DefRow label="Name on ID">{p.nameOnId || "-"}</DefRow>
              <DefRow label="BVN">{p.bvnLast4 ? `•••••••${p.bvnLast4}` : "Not provided"}</DefRow>
              <DefRow label="Address">{p.address}</DefRow>
              <DefRow label="Home location">{p.homeCity}, {p.homeCountry}</DefRow>
              <DefRow label="Travel notice">{p.travelNoticeCountry ? `${p.travelNoticeCountry} until ${dateOnly(p.travelNoticeUntil)}` : "None"}</DefRow>
              <DefRow label="Saved payees">{data.beneficiaries}</DefRow>
            </div>
          </Card>
          <Card>
            <CardHeader title="Accounts" icon={<Wallet size={16} />} />
            <div className="divide-y divide-line">
              {data.accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div><p className="font-medium text-ink">{a.type} · {a.masked}</p><p className="text-xs text-muted">Last activity {timeAgo(a.lastActivityAt)}</p></div>
                  <p className="font-semibold tabular-nums text-ink">{naira(a.balance, { decimals: 2 })}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Profile changes" subtitle="Feeds the SIM-swap and contact-change rules" icon={<Link2 size={16} />} />
            {data.changes.length === 0 ? <p className="p-5 text-sm text-muted">No recent changes.</p> : (
              <ul className="divide-y divide-line">{data.changes.map((c) => <li key={c.id} className="px-5 py-3 text-sm"><p className="font-medium text-ink">{c.field}</p><p className="text-xs text-muted">{c.detail} · {dateTime(c.changedAt)}</p></li>)}</ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Transactions" subtitle="Click one for the full rule-by-rule analysis" icon={<History size={16} />} />
            <TableWrap>
              <Table>
                <THead><tr><TH>Transaction</TH><TH>Amount</TH><TH>Score</TH><TH>Tier</TH><TH>Status</TH><TH>When</TH></tr></THead>
                <tbody>
                  {data.transactions.map((t) => (
                    <TR key={t.id} onClick={() => router.push(`/admin/transactions/${t.id}`)}>
                      <TD><p className="font-medium text-ink">{typeLabel(t.type)}</p><p className="text-xs text-muted">{t.counterpartyDisplay} · {t.failed} rules failed</p></TD>
                      <TD className="whitespace-nowrap font-semibold tabular-nums text-ink">{naira(t.amount)}</TD>
                      <TD><ScoreMeter score={t.score} tier={t.tier} compact /></TD>
                      <TD><RiskBadge tier={t.tier} /></TD>
                      <TD><StatusBadge status={t.status} /></TD>
                      <TD className="whitespace-nowrap text-xs text-muted">{dateTime(t.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Devices" icon={<Laptop size={16} />} />
              <ul className="divide-y divide-line">
                {data.devices.map((d) => (
                  <li key={d.id} className="px-5 py-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-ink">{d.label || "Device"} {d.trusted && <Badge tone="success">Trusted</Badge>}</p>
                    <p className="font-mono text-[11px] text-muted">{d.fingerprint}</p>
                    <p className="text-xs text-muted">First seen {dateOnly(d.firstSeenAt)} · last {timeAgo(d.lastSeenAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Sign-in history" icon={<LogIn size={16} />} />
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {data.logins.map((l) => (
                  <li key={l.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div><p className="text-ink">{l.city}, {l.country} {l.simulated && <Badge tone="info">demo</Badge>}</p><p className="font-mono text-[11px] text-muted">{l.ip}</p></div>
                    <div className="text-right"><Badge tone={l.success ? "success" : "danger"}>{l.success ? "Success" : "Failed"}</Badge><p className="mt-0.5 text-[11px] text-muted">{timeAgo(l.createdAt)}</p></div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={suspended ? "Reactivate this account" : "Suspend this account"} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant={suspended ? "success" : "danger"} loading={busy} onClick={toggle}>Confirm</Button></>}>
        <Field label="Reason (recorded in the audit log)"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
