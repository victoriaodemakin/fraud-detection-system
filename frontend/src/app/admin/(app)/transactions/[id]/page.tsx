"use client";

import { ArrowLeft, Ban, CheckCircle2, Flag, KeyRound, Lock, MessageSquarePlus, ShieldCheck, Unlock, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { DecisionSummary, RuleChecksTable } from "@/components/shared/TransactionAnalysis";
import { Timeline } from "@/components/shared/Timeline";
import { Alert, ErrorState, Modal, PageLoader } from "@/components/ui/feedback";
import { Avatar, Badge, Button, Card, CardHeader, Field, PageHeader, RiskBadge, ScoreMeter, StatusBadge, Textarea } from "@/components/ui/base";
import { DefRow, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api } from "@/lib/http";
import { dateTime, naira, typeLabel } from "@/lib/format";
import type { TxDetail } from "@/lib/types";

interface Case {
  detail: TxDetail;
  customer: { id: number; fullName: string; email: string; phone: string; segment: string; kyc: string; createdAt: string; status: string; homeCountry: string; homeCity: string; balance: number };
  stats: { transactions: number; approved: number; flagged: number; blocked: number; rejected: number; averageScore: number };
  related: { id: number; reference: string; type: string; status: string; amount: number; score: number; tier: string; createdAt: string }[];
}
interface Decrypted { counterparty: string; accountNumber: string; rawPayload: string; counterpartyCipherText: string }

type Action = "approve" | "reject" | "escalate" | "note" | null;

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { refreshPending } = useAdmin();
  const { data, error, loading, reload } = useApi<Case>("admin", `/admin/transactions/${id}`);
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dec, setDec] = useState<Decrypted | null>(null);
  const [decBusy, setDecBusy] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { detail: d, customer: c, stats, related } = data;
  const reviewable = d.status === "PendingReview" || d.status === "Blocked";

  function open(a: Action) { setAction(a); setNote(""); setErr(null); }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (action === "approve" || action === "reject") {
        await api("admin", `/admin/transactions/${id}/review`, { method: "POST", body: { approve: action === "approve", note } });
        toast.success(action === "approve" ? "Transaction approved" : "Transaction declined", "The customer has been notified of the outcome only.");
      } else if (action === "escalate") {
        await api("admin", `/admin/transactions/${id}/escalate`, { method: "POST", body: { note } });
        toast.info("Escalated", "Recorded in the audit trail.");
      } else {
        await api("admin", `/admin/transactions/${id}/notes`, { method: "POST", body: { note } });
        toast.success("Note added");
      }
      setAction(null);
      reload();
      refreshPending();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function decrypt() {
    setDecBusy(true);
    try {
      setDec(await api<Decrypted>("admin", `/admin/transactions/${id}/decrypt`, { method: "POST" }));
      reload();
    } catch (e) {
      toast.error("Could not decrypt", e instanceof ApiError ? e.message : undefined);
    } finally {
      setDecBusy(false);
    }
  }

  const titles: Record<string, string> = { approve: "Approve this transaction", reject: "Decline this transaction", escalate: "Escalate to a senior analyst", note: "Add a case note" };

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/admin/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"><ArrowLeft size={15} /> All transactions</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{typeLabel(d.type)} · {naira(d.amount, { decimals: 2 })} <StatusBadge status={d.status} /> <RiskBadge tier={d.hybrid.riskTier} /></span>}
        subtitle={<span className="font-mono text-xs">{d.reference} · {dateTime(d.createdAt)}</span>}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<MessageSquarePlus size={14} />} onClick={() => open("note")}>Add note</Button>
            <Button variant="secondary" size="sm" icon={<Flag size={14} />} onClick={() => open("escalate")}>Escalate</Button>
            {reviewable && <Button variant="danger" size="sm" icon={<Ban size={14} />} onClick={() => open("reject")}>Decline</Button>}
            {reviewable && <Button variant="success" size="sm" icon={<CheckCircle2 size={14} />} onClick={() => open("approve")}>Approve</Button>}
          </>
        }
      />

      {d.status === "Blocked" && <Alert tone="danger" title="Blocked automatically">The money never left the customer&apos;s account. You can still approve it after review if it turns out to be genuine.</Alert>}
      {d.status === "PendingReview" && <Alert tone="warn" title="Awaiting your decision">The customer sees only that this payment is under review. Their money is still in the account.</Alert>}
      {d.reviewedBy && <Alert tone="info" title={`Reviewed by ${d.reviewedBy}`}>{dateTime(d.reviewedAt)}. The reviewer note is in the audit trail below.</Alert>}

      <DecisionSummary d={d} />
      <RuleChecksTable checks={d.checks} />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Timeline events={d.timeline} />

        <div className="space-y-5">
          <Card>
            <CardHeader title="Transaction details" icon={<ShieldCheck size={16} />} />
            <div className="p-5">
              <DefRow label="Channel">{d.channel}</DefRow>
              <DefRow label="Counterparty">{d.counterpartyDisplay}</DefRow>
              <DefRow label="Narration">{d.narration || "-"}</DefRow>
              {d.merchantCategory && <DefRow label="Merchant category">{d.merchantCategory}</DefRow>}
              {d.shippingAddress && <DefRow label="Shipping address">{d.shippingAddress}</DefRow>}
              <DefRow label="Location">{d.city}, {d.country} <Badge>{d.locationSource}</Badge></DefRow>
              <DefRow label="IP address"><span className="font-mono text-xs">{d.ip}</span></DefRow>
              <DefRow label="Device"><span className="font-mono text-xs">{d.deviceFingerprint}</span></DefRow>
              <DefRow label="Account">••••{d.accountLast4}</DefRow>
            </div>
          </Card>

          <Card>
            <CardHeader title="Protected data" subtitle="PGP-encrypted at rest. Decrypting is logged." icon={<Lock size={16} />} />
            <div className="space-y-3 p-5">
              {dec ? (
                <>
                  <DefRow label="Counterparty">{dec.counterparty}</DefRow>
                  <DefRow label="Account number"><span className="font-mono">{dec.accountNumber}</span></DefRow>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Raw screening payload</p>
                    <pre className="max-h-48 overflow-auto rounded-xl bg-soft p-3 text-[11px] leading-relaxed text-ink2">{dec.rawPayload}</pre>
                  </div>
                  <details className="text-xs text-muted"><summary className="cursor-pointer">Show stored ciphertext</summary><pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-soft p-3 text-[10px]">{dec.counterpartyCipherText}</pre></details>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink2">Counterparty details, the full account number and the raw screening payload are stored encrypted. Decrypting uses the PGP private key and is recorded in the audit log.</p>
                  <Button variant="outline" size="sm" loading={decBusy} icon={<Unlock size={14} />} onClick={decrypt}>Decrypt sensitive data</Button>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" icon={<User size={16} />} action={<Link href={`/admin/customers/${c.id}`} className="text-xs font-medium text-brand hover:underline">Open profile</Link>} />
            <div className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <Avatar name={c.fullName} size={42} />
                <div><p className="font-semibold text-ink">{c.fullName}</p><p className="text-xs text-muted">{c.email}</p></div>
              </div>
              <DefRow label="Segment">{c.segment}</DefRow>
              <DefRow label="KYC"><Badge tone={c.kyc === "Verified" ? "success" : "warn"}>{c.kyc}</Badge></DefRow>
              <DefRow label="Customer since">{dateTime(c.createdAt)}</DefRow>
              <DefRow label="Home location">{c.homeCity}, {c.homeCountry}</DefRow>
              <DefRow label="Balance">{naira(c.balance, { decimals: 2 })}</DefRow>
              <DefRow label="Account status"><Badge tone={c.status === "Active" ? "success" : "danger"}>{c.status}</Badge></DefRow>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                {[["Total", stats.transactions, "text-ink"], ["Held", stats.flagged, "text-warn"], ["Blocked", stats.blocked, "text-danger"], ["Avg score", stats.averageScore, "text-brand"]].map(([l, v, cls]) => (
                  <div key={l as string} className="rounded-xl bg-soft py-2"><p className={`text-base font-semibold ${cls}`}>{v as number}</p><p className="text-muted">{l as string}</p></div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {related.length > 0 && (
        <Card>
          <CardHeader title="Customer's recent transactions" subtitle="For context when deciding" icon={<KeyRound size={16} />} />
          <TableWrap>
            <Table>
              <THead><tr><TH>Reference</TH><TH>Type</TH><TH>Amount</TH><TH>Score</TH><TH>Status</TH><TH>When</TH></tr></THead>
              <tbody>
                {related.map((r) => (
                  <TR key={r.id} onClick={() => { window.location.href = `/admin/transactions/${r.id}`; }}>
                    <TD className="font-mono text-xs">{r.reference}</TD><TD>{typeLabel(r.type)}</TD><TD className="tabular-nums font-medium text-ink">{naira(r.amount)}</TD>
                    <TD><ScoreMeter score={r.score} tier={r.tier} compact /></TD><TD><StatusBadge status={r.status} /></TD><TD className="text-xs text-muted">{dateTime(r.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? titles[action] : ""}
        footer={<><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button><Button variant={action === "reject" ? "danger" : action === "approve" ? "success" : "primary"} loading={busy} onClick={submit}>Confirm</Button></>}
      >
        <div className="space-y-3">
          {action === "approve" && <Alert tone="info">Approving releases the payment and updates the customer&apos;s balance. They are told it was completed after a review.</Alert>}
          {action === "reject" && <Alert tone="warn">Declining keeps the money in the customer&apos;s account. They are told it could not be completed after a security review.</Alert>}
          <Field label={action === "note" || action === "escalate" ? "Note" : "Reviewer note (required, kept in the audit trail)"}>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the customer and confirmed the payment; device change was a new phone." />
          </Field>
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      </Modal>
    </div>
  );
}
