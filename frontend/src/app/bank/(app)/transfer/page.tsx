"use client";

import { Check, Send, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useBank } from "@/components/bank/BankShell";
import { AmountChips, FromAccount, PaymentError, PaymentPage, usePayment } from "@/components/bank/payment";
import { Avatar, Button, Card, Field, Input, Select, Textarea, cn } from "@/components/ui/base";
import { Tabs } from "@/components/ui/data";
import { EmptyState } from "@/components/ui/feedback";
import { PinInput } from "@/components/ui/pin";
import { BANKS } from "@/lib/banks";
import { useApi } from "@/lib/hooks";
import { naira } from "@/lib/format";
import type { Beneficiary } from "@/lib/types";

export default function TransferPage() {
  const { profile } = useBank();
  const { data: payees } = useApi<Beneficiary[]>("bank", "/bank/beneficiaries");
  const p = usePayment("/bank/transactions/transfer");
  const [mode, setMode] = useState<"saved" | "new">("saved");
  const [benId, setBenId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [bank, setBank] = useState(BANKS[0]);
  const [save, setSave] = useState(true);
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [pin, setPin] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  const amt = Number(amount);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (mode === "saved" && benId === null) return setLocalErr("Choose a saved payee, or switch to a new recipient.");
    if (mode === "new" && (name.trim().length < 2 || acct.length !== 10)) return setLocalErr("Enter the recipient's name and a 10-digit account number.");
    if (!amt || amt <= 0) return setLocalErr("Enter an amount.");
    if (pin.length !== 4) return setLocalErr("Enter your 4-digit PIN.");
    const res = await p.submit({
      accountId: profile.accounts[0].accountId,
      ...(mode === "saved" ? { beneficiaryId: benId } : { recipientName: name, recipientAccountNumber: acct, bankName: bank, saveBeneficiary: save }),
      amount: amt,
      narration,
      pin,
    });
    if (res) setPin("");
  }

  return (
    <PaymentPage
      title="Transfer money"
      subtitle="Send money to a saved payee or a new recipient. Every transfer is screened before it leaves your account."
      result={p.result}
      onAgain={() => {
        p.reset();
        setAmount("");
        setNarration("");
      }}
    >
      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-5 sm:p-6">
          <FromAccount />
          <Tabs
            value={mode}
            onChange={setMode}
            items={[
              { value: "saved", label: <span className="inline-flex items-center gap-1.5"><Users size={14} /> Saved payees</span> },
              { value: "new", label: <span className="inline-flex items-center gap-1.5"><UserPlus size={14} /> New recipient</span> },
            ]}
          />

          {mode === "saved" ? (
            !payees || payees.length === 0 ? (
              <EmptyState title="No saved payees yet" body="Add a payee, or send to a new recipient." action={<Link href="/bank/beneficiaries" className="text-sm font-semibold text-brand hover:underline">Add a payee</Link>} />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {payees.map((b) => (
                  <button key={b.id} type="button" onClick={() => setBenId(b.id)} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition", benId === b.id ? "border-brand bg-brandsoft" : "border-line hover:border-brand/40")}>
                    <Avatar name={b.name} size={38} tone="blue" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{b.name}</span>
                      <span className="block truncate text-xs text-muted">{b.bankName} · {b.masked}</span>
                    </span>
                    {benId === b.id && <Check size={18} className="text-brand" />}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina Yusuf" /></Field>
              <Field label="Account number"><Input inputMode="numeric" maxLength={10} value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" /></Field>
              <Field label="Bank"><Select value={bank} onChange={(e) => setBank(e.target.value)}>{BANKS.map((b) => <option key={b}>{b}</option>)}</Select></Field>
              <label className="flex cursor-pointer items-center gap-2.5 self-end pb-3 text-sm text-ink2">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                Save as a payee
              </label>
            </div>
          )}

          <Field label="Amount">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">₦</span>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 pl-9 text-2xl font-semibold" />
            </div>
            <AmountChips value={amount} onPick={setAmount} />
          </Field>
          <Field label="Narration (optional)"><Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. rent, feeding, thank you" className="min-h-16" /></Field>
          <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={p.pinError} /></Field>
          <PaymentError error={localErr ?? p.error} />
          <Button type="submit" size="lg" loading={p.busy} className="w-full" icon={<Send size={18} />}>{amt ? `Send ${naira(amt)}` : "Send money"}</Button>
        </Card>
      </form>
    </PaymentPage>
  );
}
