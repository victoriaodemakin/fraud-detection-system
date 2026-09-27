"use client";

import { HandCoins } from "lucide-react";
import { useState } from "react";
import { useBank } from "@/components/bank/BankShell";
import { AmountChips, PaymentError, PaymentPage, usePayment } from "@/components/bank/payment";
import { Alert } from "@/components/ui/feedback";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/base";
import { PinInput } from "@/components/ui/pin";
import { naira } from "@/lib/format";

export default function CollectPage() {
  const { profile } = useBank();
  const p = usePayment("/bank/transactions/collection");
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [pin, setPin] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const amt = Number(amount);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (name.trim().length < 2 || acct.length !== 10) return setLocalErr("Enter the payer's name and a 10-digit account number.");
    if (!amt || amt <= 0) return setLocalErr("Enter an amount.");
    if (pin.length !== 4) return setLocalErr("Enter your 4-digit PIN.");
    const res = await p.submit({ accountId: profile.accounts[0].accountId, fromName: name, fromAccountNumber: acct, amount: amt, narration, pin });
    if (res) setPin("");
  }

  return (
    <PaymentPage title="Request money" subtitle="Ask someone to pay money into your account." result={p.result} onAgain={() => { p.reset(); setAmount(""); }}>
      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Requesting from"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Payer's name" /></Field>
            <Field label="Their account number"><Input inputMode="numeric" maxLength={10} value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, ""))} placeholder="10 digits" /></Field>
          </div>
          <Field label="Amount">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">₦</span>
              <Input type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 pl-9 text-2xl font-semibold" />
            </div>
            <AmountChips value={amount} onPick={setAmount} />
          </Field>
          <Field label="Reason (optional)"><Textarea rows={2} value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="e.g. split bill, invoice #124" className="min-h-16" /></Field>
          <Alert tone="info">Money is added to your balance once the request is completed.</Alert>
          <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={p.pinError} /></Field>
          <PaymentError error={localErr ?? p.error} />
          <Button type="submit" size="lg" loading={p.busy} className="w-full" icon={<HandCoins size={18} />}>{amt ? `Request ${naira(amt)}` : "Request money"}</Button>
        </Card>
      </form>
    </PaymentPage>
  );
}
