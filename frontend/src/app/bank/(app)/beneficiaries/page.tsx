"use client";

import { Plus, Send, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, EmptyState, ErrorState, Modal, PageLoader } from "@/components/ui/feedback";
import { Avatar, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui/base";
import { useToast } from "@/components/ui/toast";
import { BANKS } from "@/lib/banks";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { dateOnly } from "@/lib/format";
import type { Beneficiary } from "@/lib/types";

export default function BeneficiariesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Beneficiary[]>("bank", "/bank/beneficiaries");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [bank, setBank] = useState(BANKS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await api("bank", "/bank/beneficiaries", { method: "POST", body: { name, bankName: bank, accountNumber: acct } });
      toast.success("Payee saved", `${name} was added.`);
      setOpen(false);
      setName("");
      setAcct("");
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not save the payee.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Beneficiary) {
    await api("bank", `/bank/beneficiaries/${b.id}`, { method: "DELETE" });
    toast.info("Payee removed", b.name);
    reload();
  }

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="Beneficiaries" subtitle="People and businesses you pay often. Account numbers are stored PGP-encrypted." actions={<Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>Add payee</Button>} />
      <Alert tone="info" title="Security tip">
        Add the people you pay ahead of time. A large payment to a payee added moments earlier may be reviewed for your protection.
      </Alert>

      <div className="mt-5">
        {!data || data.length === 0 ? (
          <Card><EmptyState title="No saved payees" body="Add someone you pay often to send money faster." icon={<UserPlus size={22} />} action={<Button onClick={() => setOpen(true)}>Add payee</Button>} /></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((b) => (
              <Card key={b.id} hover className="p-5">
                <div className="flex items-start justify-between">
                  <Avatar name={b.name} size={46} tone="blue" />
                  <button onClick={() => remove(b)} className="rounded-lg p-1.5 text-muted hover:bg-dangersoft hover:text-danger" aria-label={`Remove ${b.name}`}><Trash2 size={16} /></button>
                </div>
                <p className="mt-3 font-semibold text-ink">{b.name}</p>
                <p className="text-sm text-muted">{b.bankName} · {b.masked}</p>
                <p className="mt-1 text-xs text-muted">Added {dateOnly(b.addedAt)}</p>
                <Link href="/bank/transfer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><Send size={14} /> Send money</Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a payee" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} loading={busy} disabled={!name || acct.length !== 10}>Save payee</Button></>}>
        <div className="space-y-4">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina Yusuf" /></Field>
          <Field label="Account number"><Input inputMode="numeric" maxLength={10} value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" /></Field>
          <Field label="Bank"><Select value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b}>{b}</option>)}</Select></Field>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      </Modal>
    </div>
  );
}
