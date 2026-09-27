"use client";

import { motion } from "framer-motion";
import { Cpu, FileLock2, MessageSquare, ShieldCheck, UserCheck, Flag } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/base";
import { dateTime } from "@/lib/format";
import type { TimelineEvent } from "@/lib/types";

function iconFor(e: TimelineEvent) {
  if (e.kind === "note") return <MessageSquare size={14} />;
  if (e.title.startsWith("Screened")) return <Cpu size={14} />;
  if (e.title.startsWith("Reviewed")) return <UserCheck size={14} />;
  if (e.title.startsWith("Protected")) return <FileLock2 size={14} />;
  if (e.title.startsWith("Escalated")) return <Flag size={14} />;
  return <ShieldCheck size={14} />;
}

// Audit trail of one transaction: screening, notes, analyst decisions and data access.
export function Timeline({ events, title = "Audit trail" }: { events: TimelineEvent[]; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle="Every action on this transaction is recorded" icon={<ShieldCheck size={16} />} />
      <div className="p-5">
        {events.length === 0 ? (
          <p className="text-sm text-muted">No events recorded.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-line pl-6">
            {events.map((e, i) => (
              <motion.li key={i} className="relative" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <span className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full border border-line bg-brandsoft text-brand">{iconFor(e)}</span>
                <p className="text-sm font-medium text-ink">{e.title}</p>
                <p className="mt-0.5 text-xs text-ink2">{e.detail}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {e.actor} · {dateTime(e.at)}
                </p>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
