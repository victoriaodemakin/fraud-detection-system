"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cpu, MapPin, Pause, Play, Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar, Badge, Button, Card, PageHeader, ScoreMeter, StatusBadge, cn } from "@/components/ui/base";
import { StatCard, Tabs } from "@/components/ui/data";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { useApi } from "@/lib/hooks";
import { naira, pct, timeAgo, typeLabel } from "@/lib/format";
import { TxIcon } from "@/components/bank/tx";
import type { Tier, TxType } from "@/lib/types";

interface Item {
  id: number; reference: string; customer: string; type: TxType; status: string; amount: number; country: string; city: string;
  score: number; tier: Tier; decision: string; ruleScore: number; ml: number; failed: number; topRules: string[]; createdAt: string;
}

export default function MonitorPage() {
  const router = useRouter();
  const [live, setLive] = useState(true);
  const [tier, setTier] = useState("all");
  const { data, error, loading, reload } = useApi<{ serverTime: string; items: Item[] }>("admin", "/admin/monitor", { take: 50 }, { poll: live ? 4000 : undefined });
  const seen = useRef<Set<number>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!data) return;
    const ids = data.items.map((i) => i.id);
    if (seen.current.size === 0) {
      ids.forEach((i) => seen.current.add(i));
      return;
    }
    const added = ids.filter((i) => !seen.current.has(i));
    if (added.length) {
      ids.forEach((i) => seen.current.add(i));
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 4000);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const items = data.items.filter((i) => tier === "all" || i.tier === tier);
  const count = (t: Tier) => data.items.filter((i) => i.tier === t).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={<span className="inline-flex items-center gap-3">Live monitor {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-successsoft px-2.5 py-1 text-xs font-medium text-success"><span className="live-dot" /> Live</span>}</span>}
        subtitle="Every transaction the framework screens appears here within seconds, with the rules that fired."
        actions={<Button variant={live ? "secondary" : "primary"} size="sm" icon={live ? <Pause size={14} /> : <Play size={14} />} onClick={() => setLive(!live)}>{live ? "Pause feed" : "Resume feed"}</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Low risk (last 50)" value={count("Low")} icon={<Radio size={18} />} tone="success" />
        <StatCard label="Medium risk" value={count("Medium")} icon={<Radio size={18} />} tone="warn" />
        <StatCard label="High risk" value={count("High")} icon={<Radio size={18} />} tone="danger" />
      </div>

      <Tabs value={tier} onChange={setTier} items={[{ value: "all", label: "All" }, { value: "Low", label: "Low" }, { value: "Medium", label: "Medium" }, { value: "High", label: "High" }]} />

      <Card>
        {items.length === 0 ? (
          <EmptyState title="Nothing to show" body="Transactions will stream in as customers make payments." />
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.li
                  key={it.id}
                  layout
                  initial={{ opacity: 0, x: -30, backgroundColor: "var(--brand-soft)" }}
                  animate={{ opacity: 1, x: 0, backgroundColor: fresh.has(it.id) ? "var(--brand-soft)" : "rgba(0,0,0,0)" }}
                  transition={{ duration: 0.4 }}
                  onClick={() => router.push(`/admin/transactions/${it.id}`)}
                  className="flex cursor-pointer flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-b-0 hover:bg-brandsoft/50"
                >
                  <TxIcon type={it.type} size={44} />
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{it.customer}</p>
                      {fresh.has(it.id) && <Badge tone="purple">new</Badge>}
                    </div>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {typeLabel(it.type)} · <span className="inline-flex items-center gap-1"><MapPin size={11} />{it.city || "?"}, {it.country || "?"}</span> · {timeAgo(it.createdAt)}
                    </p>
                    {it.topRules.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {it.topRules.map((r) => <span key={r} className="rounded-md border border-danger/25 bg-dangersoft px-1.5 py-0.5 text-[11px] font-medium text-danger">{r}</span>)}
                        {it.failed > it.topRules.length && <span className="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] text-muted">+{it.failed - it.topRules.length} more</span>}
                      </div>
                    )}
                  </div>
                  <div className="w-32 text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink">{naira(it.amount)}</p>
                    <div className="mt-1 flex justify-end"><StatusBadge status={it.status} /></div>
                  </div>
                  <div className="hidden w-44 md:block">
                    <ScoreMeter score={it.score} tier={it.tier} />
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Cpu size={11} /> rules {it.ruleScore} · ML {pct(it.ml, 0)}</p>
                  </div>
                  <Avatar name={it.customer} size={30} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>
      <p className={cn("text-center text-xs text-muted", !live && "opacity-60")}>{live ? "Refreshing every 4 seconds" : "Feed paused"}</p>
    </div>
  );
}
