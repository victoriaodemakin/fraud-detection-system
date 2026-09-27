"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Hourglass, Lock, ShieldCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, PageHeader, cn } from "@/components/ui/base";

const FAQ = [
  { q: "Why is my payment under review?", a: "Some payments are held briefly so our security team can confirm they are genuine, for example a large amount, a new device or an unusual location. Your money stays in your account while we review, and we notify you as soon as it is done, usually within a few hours." },
  { q: "Why was my payment not completed?", a: "When a payment looks clearly fraudulent, we stop it to protect you. Your money has not left your account. If it was really you, contact support and quote the payment reference." },
  { q: "How can I avoid delays when I travel?", a: "Add a travel notice in the Security centre before you leave, so payments made abroad are less likely to be held." },
  { q: "What is the demo lab?", a: "It lets you place a payment in a different situation (a foreign location, a new device, an unusual hour) so you can demonstrate the system. The analyst dashboard shows how each payment was screened. It is for demonstration only." },
  { q: "Is my data safe?", a: "Account numbers and counterparty details are encrypted before they are stored, and your password and PIN are stored only as one-way hashes. We never show your PIN to anyone." },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-6">
      <PageHeader title="Help & fraud protection" subtitle="How Arclight keeps your money safe, and what to do when a payment is held." />

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Checked in real time", body: "Every payment is checked by our fraud protection before any money moves.", tone: "bg-brandsoft text-brand" },
          { icon: Hourglass, title: "Reviewed when needed", body: "If something looks unusual, the payment is held for a quick review by our security team. Your money stays in your account.", tone: "bg-warnsoft text-warn" },
          { icon: UserCog, title: "Stopped when risky", body: "Payments that look clearly fraudulent are stopped, and you are notified straight away.", tone: "bg-successsoft text-success" },
        ].map((c) => (
          <Card key={c.title} className="p-5">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", c.tone)}><c.icon size={20} /></div>
            <h3 className="mt-3 font-semibold text-ink">{c.title}</h3>
            <p className="mt-1.5 text-sm text-ink2">{c.body}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Frequently asked questions" icon={<Lock size={16} />} />
        <ul>
          {FAQ.map((f, i) => (
            <li key={f.q} className="border-b border-line last:border-b-0">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                <span className="text-sm font-medium text-ink">{f.q}</span>
                <ChevronDown size={17} className={cn("shrink-0 text-muted transition", open === i && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm leading-relaxed text-ink2">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
