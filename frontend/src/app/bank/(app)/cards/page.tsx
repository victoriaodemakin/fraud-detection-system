"use client";

import { AlertTriangle, CreditCard, Globe, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useBank } from "@/components/bank/BankShell";
import { AmountChips, FromAccount, PaymentError, PaymentPage, usePayment } from "@/components/bank/payment";
import { Badge, Button, Card, Field, Input, cn } from "@/components/ui/base";
import { PageLoader } from "@/components/ui/feedback";
import { PinInput } from "@/components/ui/pin";
import { useApi } from "@/lib/hooks";
import { naira } from "@/lib/format";
import type { Merchant } from "@/lib/types";

export default function CardsPage() {
  const { profile } = useBank();
  const { data: merchants } = useApi<Merchant[]>("bank", "/bank/merchants");
  const p = usePayment("/bank/transactions/card");
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [shipping, setShipping] = useState(profile.address);
  const [pin, setPin] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const amt = Number(amount);

  if (!merchants) return <PageLoader />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (merchantId === null) return setLocalErr("Choose a merchant.");
    if (!amt || amt <= 0) return setLocalErr("Enter an amount.");
    if (pin.length !== 4) return setLocalErr("Enter your 4-digit PIN.");
    const res = await p.submit({ accountId: profile.accounts[0].accountId, merchantId, amount: amt, shippingAddress: shipping, pin });
    if (res) setPin("");
  }

  return (
    <PaymentPage title="Card payments" subtitle="Pay merchants online with your Arclight card." result={p.result} onAgain={() => { p.reset(); setAmount(""); }}>
      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-5 sm:p-6">
          <FromAccount />

          <div className="rounded-2xl bg-brand-gradient p-5 text-white">
            <div className="flex items-center justify-between">
              <CreditCard size={26} />
              <Badge className="border-white/30 bg-white/15 text-white">Virtual card</Badge>
            </div>
            <p className="mt-6 font-mono text-lg tracking-[0.2em]">•••• •••• •••• {profile.accounts[0].accountNumber.slice(-4)}</p>
            <div className="mt-3 flex justify-between text-xs text-white/80"><span>{profile.fullName.toUpperCase()}</span><span>12/29</span></div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink2">Merchant</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {merchants.map((m) => (
                <button key={m.id} type="button" onClick={() => setMerchantId(m.id)} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition", merchantId === m.id ? "border-brand bg-brandsoft" : "border-line hover:border-brand/40")}>
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", m.highFraud ? "bg-warnsoft text-warn" : "bg-surface2 text-brand")}>{m.highFraud ? <AlertTriangle size={18} /> : <ShoppingBag size={18} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.name}</span>
                    <span className="block text-xs text-muted">{m.category}</span>
                  </span>
                  {m.highFraud && <Badge tone="warn">High risk</Badge>}
                </button>
              ))}
            </div>
          </div>

          <Field label="Amount">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">₦</span>
              <Input type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 pl-9 text-2xl font-semibold" />
            </div>
            <AmountChips value={amount} onPick={setAmount} amounts={[2000, 10000, 25000, 60000, 250000]} />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1.5"><Globe size={13} /> Shipping address</span>}>
            <Input value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="Delivery address" />
          </Field>
          <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={p.pinError} /></Field>
          <PaymentError error={localErr ?? p.error} />
          <Button type="submit" size="lg" loading={p.busy} className="w-full" icon={<CreditCard size={18} />}>{amt ? `Pay ${naira(amt)}` : "Pay merchant"}</Button>
        </Card>
      </form>
    </PaymentPage>
  );
}
