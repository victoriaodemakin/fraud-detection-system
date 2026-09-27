"use client";

import { Banknote, MapPin } from "lucide-react";
import { useState } from "react";
import { useBank } from "@/components/bank/BankShell";
import { FromAccount, PaymentError, PaymentPage, usePayment } from "@/components/bank/payment";
import { Alert } from "@/components/ui/feedback";
import { Button, Card, Field, Input, Select, cn } from "@/components/ui/base";
import { PinInput } from "@/components/ui/pin";
import { naira } from "@/lib/format";

const ATMS = ["Ikeja City Mall ATM", "Lekki Phase 1 ATM", "Yaba Tech ATM", "Surulere Branch ATM", "Victoria Island ATM"];
const PRESETS = [5000, 10000, 20000, 50000, 100000];

export default function AtmPage() {
  const { profile } = useBank();
  const p = usePayment("/bank/transactions/atm");
  const [amount, setAmount] = useState("");
  const [atm, setAtm] = useState(ATMS[0]);
  const [pin, setPin] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const amt = Number(amount);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (!amt || amt <= 0) return setLocalErr("Choose or enter an amount.");
    if (pin.length !== 4) return setLocalErr("Enter your 4-digit PIN.");
    const res = await p.submit({ accountId: profile.accounts[0].accountId, amount: amt, atmLocation: atm, pin });
    if (res) setPin("");
  }

  return (
    <PaymentPage title="ATM withdrawal" subtitle="Withdraw cash at an Arclight ATM." result={p.result} onAgain={() => { p.reset(); setAmount(""); }}>
      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-5 sm:p-6">
          <FromAccount />
          <Field label={<span className="inline-flex items-center gap-1.5"><MapPin size={13} /> ATM location</span>}>
            <Select value={atm} onChange={(e) => setAtm(e.target.value)}>{ATMS.map((a) => <option key={a}>{a}</option>)}</Select>
          </Field>
          <div>
            <p className="mb-2 text-xs font-medium text-ink2">Amount</p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {PRESETS.map((a) => (
                <button key={a} type="button" onClick={() => setAmount(String(a))} className={cn("rounded-2xl border px-2 py-4 text-sm font-semibold transition", String(a) === amount ? "border-brand bg-brandsoft text-brand" : "border-line text-ink2 hover:border-brand/40")}>
                  {naira(a, { compact: true })}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">₦</span>
              <Input type="number" min={500} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Other amount" className="h-12 pl-9 text-lg font-semibold" />
            </div>
          </div>
          <Alert tone="info">To protect you from card cloning, repeated withdrawals in a single day may be reviewed.</Alert>
          <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={p.pinError} /></Field>
          <PaymentError error={localErr ?? p.error} />
          <Button type="submit" size="lg" loading={p.busy} className="w-full" icon={<Banknote size={18} />}>{amt ? `Withdraw ${naira(amt)}` : "Withdraw cash"}</Button>
        </Card>
      </form>
    </PaymentPage>
  );
}
