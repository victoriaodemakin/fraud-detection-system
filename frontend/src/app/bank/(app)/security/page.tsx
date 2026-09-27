"use client";

import { CheckCircle2, Home, KeyRound, Laptop, Mail, MapPin, Phone, Plane, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { ChangeDialog, type ChangeKind } from "@/components/bank/ChangeDialog";
import { useBank } from "@/components/bank/BankShell";
import { Alert, EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, PageHeader, Select } from "@/components/ui/base";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { dateOnly, dateTime } from "@/lib/format";

interface Sec {
  devices: { id: number; label: string; fingerprint: string; firstSeenAt: string; lastSeenAt: string; trusted: boolean; current: boolean }[];
  logins: { id: number; success: boolean; ip: string; country: string; city: string; deviceFingerprint: string; createdAt: string }[];
  changes: { id: number; field: string; detail: string; changedAt: string }[];
  travelNoticeCountry: string | null;
  travelNoticeUntil: string | null;
  kyc: string;
}

const COUNTRIES = ["United Kingdom", "United States", "Ghana", "South Africa", "United Arab Emirates", "Germany", "Canada", "France", "Kenya", "India"];

export default function SecurityPage() {
  const toast = useToast();
  const { profile, refresh } = useBank();
  const { data, error, loading, reload } = useApi<Sec>("bank", "/bank/security");
  const [dlg, setDlg] = useState<ChangeKind | null>(null);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [days, setDays] = useState("14");
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  async function setNotice() {
    setBusy(true);
    try {
      await api("bank", "/bank/security/travel-notice", { method: "POST", body: { country, days: Number(days) } });
      toast.success("Travel notice added", `${country} for ${days} days.`);
      await refresh();
      reload();
    } catch (e) {
      toast.error("Could not save", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const active = data.travelNoticeCountry && data.travelNoticeUntil && new Date(data.travelNoticeUntil) > new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Security centre" subtitle="Manage your devices, travel plans and sensitive details to keep your account safe." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sign-in & payment security" icon={<KeyRound size={16} />} />
          <ul className="divide-y divide-line">
            {[
              { icon: KeyRound, label: "Transaction PIN", value: "••••", action: "pin" as ChangeKind, btn: "Change" },
              { icon: Phone, label: "Phone number", value: profile.phone, action: "phone" as ChangeKind, btn: "Change" },
              { icon: Mail, label: "Email address", value: profile.email, action: "email" as ChangeKind, btn: "Change" },
              { icon: Home, label: "Residential address", value: profile.address, action: "address" as ChangeKind, btn: "Change" },
            ].map((r) => (
              <li key={r.label} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandsoft text-brand"><r.icon size={17} /></span>
                <div className="min-w-0 flex-1"><p className="text-xs text-muted">{r.label}</p><p className="truncate text-sm font-medium text-ink">{r.value}</p></div>
                <Button variant="secondary" size="sm" onClick={() => setDlg(r.action)}>{r.btn}</Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Travel notice" subtitle="Tell us where you are going so foreign payments are not held up" icon={<Plane size={16} />} />
          <div className="space-y-4 p-5">
            {active ? (
              <Alert tone="success" title={`Travel notice active: ${data.travelNoticeCountry}`}>
                Valid until {dateOnly(data.travelNoticeUntil)}.{" "}
                <button className="font-semibold underline" onClick={async () => { await api("bank", "/bank/security/travel-notice", { method: "DELETE" }); await refresh(); reload(); }}>Remove</button>
              </Alert>
            ) : (
              <Alert tone="info">No active travel notice. Payments made from outside Nigeria may be held for review.</Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Field label="Destination country"><Select value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Days"><Select value={days} onChange={(e) => setDays(e.target.value)}>{["3", "7", "14", "30", "60"].map((d) => <option key={d}>{d}</option>)}</Select></Field>
            </div>
            <Button onClick={setNotice} loading={busy} icon={<MapPin size={16} />}>Save travel notice</Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your devices" subtitle="Devices that have signed in to your account" icon={<Laptop size={16} />} />
        <TableWrap>
          <Table>
            <THead><tr><TH>Device</TH><TH>First seen</TH><TH>Last seen</TH><TH>Status</TH><TH /></tr></THead>
            <tbody>
              {data.devices.map((d) => (
                <TR key={d.id}>
                  <TD><p className="font-medium text-ink">{d.label}</p><p className="font-mono text-[11px] text-muted">{d.fingerprint.slice(0, 22)}</p></TD>
                  <TD>{dateTime(d.firstSeenAt)}</TD>
                  <TD>{dateTime(d.lastSeenAt)}</TD>
                  <TD>{d.current ? <Badge tone="success">This device</Badge> : d.trusted ? <Badge tone="blue">Trusted</Badge> : <Badge>Unverified</Badge>}</TD>
                  <TD className="text-right">{!d.current && <button className="rounded-lg p-1.5 text-muted hover:bg-dangersoft hover:text-danger" aria-label="Remove device" onClick={async () => { await api("bank", `/bank/security/devices/${d.id}`, { method: "DELETE" }); reload(); }}><Trash2 size={15} /></button>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent sign-ins" icon={<ShieldCheck size={16} />} />
          <ul className="divide-y divide-line">
            {data.logins.length === 0 && <EmptyState title="No sign-ins recorded" />}
            {data.logins.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                {l.success ? <CheckCircle2 size={18} className="text-success" /> : <XCircle size={18} className="text-danger" />}
                <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{l.success ? "Successful sign-in" : "Failed attempt"}</p><p className="text-xs text-muted">{l.city}, {l.country} · {l.ip}</p></div>
                <span className="text-xs text-muted">{dateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Profile change history" subtitle="Recent changes to your details" />
          <ul className="divide-y divide-line">
            {data.changes.length === 0 && <EmptyState title="No changes yet" body="Changes to your phone, email, address or PIN appear here." />}
            {data.changes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div><Badge tone="purple">{c.field}</Badge><p className="mt-1 text-sm text-ink2">{c.detail}</p></div>
                <span className="text-xs text-muted">{dateTime(c.changedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ChangeDialog kind={dlg} onClose={() => setDlg(null)} onDone={reload} />
    </div>
  );
}
