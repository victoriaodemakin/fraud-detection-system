"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui/base";
import { PROMOS } from "@/lib/promos";

// Rotating advert banner used on the dashboard.
export function PromoCarousel({ limit = PROMOS.length }: { limit?: number }) {
  const list = PROMOS.slice(0, limit);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 5500);
    return () => clearInterval(t);
  }, [list.length]);
  const p = list[i];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line shadow-card">
      <AnimatePresence mode="wait">
        <motion.div key={p.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35 }} className="flex items-center gap-5 p-6 text-white" style={{ background: p.gradient }}>
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 sm:flex"><p.icon size={30} /></div>
          <div className="min-w-0 flex-1">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-medium">{p.badge}</span>
            <h3 className="mt-2 text-lg font-semibold leading-snug">{p.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-white/80">{p.body}</p>
          </div>
          <Link href={p.href} className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#3b1275] transition hover:bg-white/90 sm:inline-flex">
            {p.cta} <ArrowRight size={15} />
          </Link>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-2.5 right-4 flex gap-1.5">
        {list.map((x, idx) => (
          <button key={x.id} onClick={() => setI(idx)} aria-label={`Show advert ${idx + 1}`} className={cn("h-1.5 rounded-full transition-all", idx === i ? "w-5 bg-white" : "w-1.5 bg-white/50")} />
        ))}
      </div>
    </div>
  );
}
