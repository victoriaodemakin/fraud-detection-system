"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgePercent, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui/base";
import { useToast } from "@/components/ui/toast";
import { PROMOS } from "@/lib/promos";

export default function OffersPage() {
  const toast = useToast();
  return (
    <div>
      <PageHeader title="Offers for you" subtitle="Savings, loans, cards and rewards picked for your account." actions={<Badge tone="purple" icon={<Sparkles size={13} />}>Personalised</Badge>} />

      <div className="grid gap-5 md:grid-cols-2">
        {PROMOS.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} whileHover={{ y: -4 }} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
            <div className="relative p-6 text-white" style={{ background: p.gradient }}>
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15"><p.icon size={28} /></div>
                <Badge className="border-white/30 bg-white/15 text-white">{p.badge}</Badge>
              </div>
              <h3 className="relative mt-5 text-xl font-semibold leading-snug">{p.title}</h3>
            </div>
            <div className="flex items-end justify-between gap-4 p-5">
              <p className="text-sm text-ink2">{p.body}</p>
              {p.href === "/bank/offers" ? (
                <button onClick={() => toast.info("Thanks for your interest", "This offer is a demonstration and is not available.")} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brandsoft px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand hover:text-white">{p.cta}<ArrowRight size={15} /></button>
              ) : (
                <Link href={p.href} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brandsoft px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand hover:text-white">{p.cta}<ArrowRight size={15} /></Link>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted"><BadgePercent size={14} /> Offers are for demonstration only and carry no real terms.</p>
    </div>
  );
}
