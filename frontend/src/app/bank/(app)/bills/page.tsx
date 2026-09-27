"use client";

import { Droplets, Receipt, Tv, Wifi, Zap, Smartphone, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useBank } from "@/components/bank/BankShell";
import { AmountChips, FromAccount, PaymentError, PaymentPage, usePayment } from "@/components/bank/payment";
import { Button, Card, Field, Input, cn } from "@/components/ui/base";
import { PageLoader } from "@/components/ui/feedback";
import { PinInput } from "@/components/ui/pin";
import { useApi } from "@/lib/hooks";
import { naira } from "@/lib/format";
import type { Biller } from "@/lib/types";

const CAT_ICON: Record<string, LucideIcon> = { Electricity: Zap, "Cable TV": Tv, "Airtime & Data": Smartphone, Water: Droplets, Internet: Wifi };

export default function BillsPage() {
  const { profile } = useBank();
  const { data: billers } = useApi<Biller[]>("bank", "/bank/billers");
  const p = usePayment("/bank/transactions/billpayment");
  const [category, setCategory] = useState("Electricity");
  const [billerId, setBillerId] = useState<number | null>(null);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  const categories = useMemo(() => Array.from(new Set((billers ?? []).map((b) => b.category))), [billers]);
  const list = (billers ?? []).filter((b) => b.category === category);
  const amt = Number(amount);

  if (!billers) return <PageLoader />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (billerId === null) return setLocalErr("Choose a biller.");
    if (!ref.trim()) return setLocalErr("Enter the meter, customer or phone number.");
    if (!amt || amt <= 0) return setLocalErr("Enter an amount.");
    if (pin.length !== 4) return setLocalErr("Enter your 4-digit PIN.");
    const res = await p.submit({ accountId: profile.accounts[0].accountId, billerId, customerReference: ref, amount: amt, pin });
    if (res) setPin("");
  }

  return (
    <PaymentPage title="Pay a bill" subtitle="Electricity, cable TV, airtime and data, internet and water, all screened like any other payment." result={p.result} onAgain={() => { p.reset(); setAmount(""); setRef(""); }}>
      <form onSubmit={onSubmit}>
        <Card className="space-y-5 p-5 sm:p-6">
          <FromAccount />
          <div>
            <p className="mb-2 text-xs font-medium text-ink2">Category</p>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {categories.map((c) => {
                const I = CAT_ICON[c] ?? Receipt;
                return (
                  <button key={c} type="button" onClick={() => { setCategory(c); setBillerId(null); }} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition", category === c ? "border-brand bg-brandsoft text-brand" : "border-line text-ink2 hover:border-brand/40")}>
                    <I size={20} />
                    <span className="text-[11px] font-medium leading-tight">{c}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink2">Biller</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((b) => (
                <button key={b.id} type="button" onClick={() => setBillerId(b.id)} className={cn("rounded-xl border px-4 py-3 text-left text-sm font-medium transition", billerId === b.id ? "border-brand bg-brandsoft text-brand" : "border-line text-ink2 hover:border-brand/40")}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
          <Field label={category === "Electricity" ? "Meter number" : category === "Cable TV" ? "Smartcard / IUC number" : category === "Airtime & Data" ? "Phone number" : "Customer number"}>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Enter number" />
          </Field>
          <Field label="Amount">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">₦</span>
              <Input type="number" min={50} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-14 pl-9 text-2xl font-semibold" />
            </div>
            <AmountChips value={amount} onPick={setAmount} amounts={[500, 1000, 2000, 5000, 10000]} />
          </Field>
          <Field label="Transaction PIN"><PinInput value={pin} onChange={setPin} invalid={p.pinError} /></Field>
          <PaymentError error={localErr ?? p.error} />
          <Button type="submit" size="lg" loading={p.busy} className="w-full" icon={<Receipt size={18} />}>{amt ? `Pay ${naira(amt)}` : "Pay bill"}</Button>
        </Card>
      </form>
    </PaymentPage>
  );
}
