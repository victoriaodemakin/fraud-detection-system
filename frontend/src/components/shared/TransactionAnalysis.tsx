"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CheckCircle2, CircleSlash, XCircle, Cpu, ListChecks, Scale, ShieldAlert, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import { RiskGauge } from "@/components/charts/charts";
import { Badge, Card, CardHeader, OutcomeBadge, RiskBadge, cn, tierColor } from "@/components/ui/base";
import { Progress, Tabs } from "@/components/ui/data";
import { pct } from "@/lib/format";
import type { RuleCheck, TxDetail } from "@/lib/types";

// ---------------------------------------------------------------------------
// Decision summary: gauge + the worked hybrid formula + the three detectors side by side.
// ---------------------------------------------------------------------------
export function DecisionSummary({ d }: { d: TxDetail }) {
  const h = d.hybrid;
  const failed = d.checks.filter((c) => c.outcome === "Fail");
  const passed = d.checks.filter((c) => c.outcome === "Pass").length;
  const na = d.checks.filter((c) => c.outcome === "NotApplicable").length;
  const mlPart = h.mlProbability * 100 * h.mlWeight;
  const rulePart = h.ruleScore * h.ruleWeight;

  const verdict =
    h.decision === "Approve"
      ? "Approved automatically"
      : h.decision === "Flag and review"
        ? "Held for analyst review"
        : h.hardBlock
          ? "Blocked by a hard rule"
          : "Blocked automatically";

  return (
    <Card>
      <CardHeader title="Screening decision" subtitle="How the hybrid framework judged this transaction" icon={<Scale size={16} />} action={<RiskBadge tier={h.riskTier} />} />
      <div className="grid gap-6 p-5 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col items-center justify-center">
          <RiskGauge score={h.riskScore} lowMax={h.lowMax} mediumMax={h.mediumMax} />
          <p className="mt-3 text-center text-sm font-semibold text-ink">{verdict}</p>
          <p className="text-center text-xs text-muted">
            Bands: Low 0-{h.lowMax} · Medium {h.lowMax + 1}-{h.mediumMax} · High {h.mediumMax + 1}-100
          </p>
        </div>

        <div className="space-y-4">
          {/* worked formula */}
          <div className="rounded-xl border border-line bg-soft p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Hybrid risk score</p>
            {h.hardBlock ? (
              <p className="mt-2 text-sm text-ink2">
                A <b>hard-block rule</b> failed, so the transaction was stopped immediately and scored <b>100</b>. The machine learning layer was not consulted.
              </p>
            ) : (
              <>
                <p className="mt-2 font-mono text-[13px] leading-relaxed text-ink2">
                  risk = {h.ruleWeight} × rule score + {h.mlWeight} × (ML probability × 100)
                </p>
                <p className="mt-1 font-mono text-[13px] leading-relaxed text-ink">
                  = {h.ruleWeight} × {h.ruleScore} + {h.mlWeight} × {(h.mlProbability * 100).toFixed(1)} = {rulePart.toFixed(1)} + {mlPart.toFixed(1)} ={" "}
                  <b style={{ color: tierColor(h.riskTier) }}>{h.riskScore}</b>
                </p>
              </>
            )}
          </div>

          {/* the two layers */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ListChecks size={16} className="text-brand" /> Layer 1: Rule engine
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {h.ruleScore}
                <span className="text-sm font-normal text-muted"> / 100 rule score</span>
              </p>
              <div className="mt-2">
                <Progress value={h.ruleScore} tone={h.ruleScore <= h.lowMax ? "success" : h.ruleScore <= h.mediumMax ? "warn" : "danger"} />
              </div>
              <p className="mt-2 text-xs text-muted">
                <span className="font-semibold text-danger">{failed.length} failed</span> · <span className="font-semibold text-success">{passed} passed</span> · {na} not applicable
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Cpu size={16} className="text-brand2" /> Layer 2: Machine learning
              </div>
              {d.ml.ran ? (
                <>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                    {pct(h.mlProbability)}
                    <span className="text-sm font-normal text-muted"> fraud probability</span>
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <ModelBar label="Logistic regression" value={d.ml.logisticRegressionProbability} />
                    <ModelBar label="Decision tree" value={d.ml.decisionTreeProbability} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Not consulted, because a hard-block rule stopped the transaction first.</p>
              )}
            </div>
          </div>

          {/* three-way comparison */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">What each detector would have decided on its own</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Detector label="Rule layer only" tier={h.ruleOnlyTier} />
              <Detector label="ML layer only" tier={h.mlOnlyTier} />
              <Detector label="Hybrid (final)" tier={h.riskTier} strong />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ModelBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-muted">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-ink">{pct(value)}</span>
      </div>
      <Progress value={value * 100} tone={value < 0.31 ? "success" : value < 0.66 ? "warn" : "danger"} />
    </div>
  );
}

function Detector({ label, tier, strong }: { label: string; tier: string; strong?: boolean }) {
  const t = tier === "NotRun" ? "Not run" : tier;
  return (
    <div className={cn("flex items-center justify-between rounded-xl border px-3 py-2.5", strong ? "border-brand/40 bg-brandsoft" : "border-line bg-surface")}>
      <span className="text-xs font-medium text-ink2">{label}</span>
      {tier === "NotRun" ? <Badge>Not run</Badge> : <RiskBadge tier={t} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pass / fail table: every rule of the engine, grouped by category.
// ---------------------------------------------------------------------------
type Filter = "all" | "Fail" | "Pass" | "NotApplicable";

export function RuleChecksTable({ checks }: { checks: RuleCheck[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const counts = useMemo(
    () => ({
      all: checks.length,
      Fail: checks.filter((c) => c.outcome === "Fail").length,
      Pass: checks.filter((c) => c.outcome === "Pass").length,
      NotApplicable: checks.filter((c) => c.outcome === "NotApplicable").length,
    }),
    [checks],
  );

  const groups = useMemo(() => {
    const filtered = checks.filter((c) => filter === "all" || c.outcome === filter);
    const map = new Map<string, RuleCheck[]>();
    filtered.forEach((c) => map.set(c.category, [...(map.get(c.category) ?? []), c]));
    return Array.from(map.entries());
  }, [checks, filter]);

  return (
    <Card>
      <CardHeader
        title="Rule-based checks"
        subtitle={`${counts.all} rules evaluated: ${counts.Fail} failed, ${counts.Pass} passed, ${counts.NotApplicable} not applicable`}
        icon={<ShieldAlert size={16} />}
        action={
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "All", count: counts.all },
              { value: "Fail", label: "Failed", count: counts.Fail },
              { value: "Pass", label: "Passed", count: counts.Pass },
              { value: "NotApplicable", label: "N/A", count: counts.NotApplicable },
            ]}
          />
        }
      />
      {groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">No rules in this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="bg-soft">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="w-8 px-4 py-2.5" />
                <th className="px-2 py-2.5">Rule</th>
                <th className="px-2 py-2.5">Observed</th>
                <th className="px-2 py-2.5">Rule threshold</th>
                <th className="px-2 py-2.5 text-right">Points</th>
                <th className="px-4 py-2.5 text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([category, rows]) => {
                const failedHere = rows.filter((r) => r.outcome === "Fail").length;
                return (
                  <GroupRows
                    key={category}
                    category={category}
                    rows={rows}
                    failed={failedHere}
                    open={open}
                    toggle={(code) => setOpen((o) => ({ ...o, [code]: !o[code] }))}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function GroupRows({ category, rows, failed, open, toggle }: { category: string; rows: RuleCheck[]; failed: number; open: Record<string, boolean>; toggle: (c: string) => void }) {
  return (
    <>
      <tr className="border-t border-line bg-surface2/60">
        <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-ink">
          <span className="inline-flex items-center gap-2">
            <Layers size={13} className="text-brand" />
            {category}
            <span className="font-normal text-muted">
              {rows.length} rule{rows.length === 1 ? "" : "s"}
            </span>
            {failed > 0 && <Badge tone="danger">{failed} failed</Badge>}
          </span>
        </td>
      </tr>
      {rows.map((c) => {
        const isOpen = open[c.code];
        return (
          <RowPair key={c.code} c={c} isOpen={!!isOpen} onToggle={() => toggle(c.code)} />
        );
      })}
    </>
  );
}

function RowPair({ c, isOpen, onToggle }: { c: RuleCheck; isOpen: boolean; onToggle: () => void }) {
  const Icon = c.outcome === "Fail" ? XCircle : c.outcome === "Pass" ? CheckCircle2 : CircleSlash;
  const color = c.outcome === "Fail" ? "var(--danger)" : c.outcome === "Pass" ? "var(--success)" : "var(--muted)";
  return (
    <>
      <tr onClick={onToggle} className={cn("cursor-pointer border-t border-line transition-colors hover:bg-brandsoft/50", c.outcome === "Fail" && "bg-dangersoft/40")}>
        <td className="px-4 py-2.5">
          <Icon size={17} style={{ color }} />
        </td>
        <td className="px-2 py-2.5">
          <div className="font-medium text-ink">{c.name}</div>
          <div className="font-mono text-[11px] text-muted">{c.code}</div>
        </td>
        <td className="px-2 py-2.5 text-ink2">{c.observed}</td>
        <td className="px-2 py-2.5 text-xs text-muted">{c.threshold}</td>
        <td className="px-2 py-2.5 text-right tabular-nums">
          {c.outcome === "Fail" ? (
            <span className="font-semibold text-danger">+{c.hardBlock ? "block" : c.pointsAwarded}</span>
          ) : (
            <span className="text-muted">{c.hardBlock ? "hard" : c.points}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className="inline-flex items-center gap-1.5">
            <OutcomeBadge outcome={c.outcome} />
            <ChevronDown size={14} className={cn("text-muted transition", isOpen && "rotate-180")} />
          </span>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {isOpen && (
          <tr className="border-t border-line/60 bg-soft">
            <td colSpan={6} className="p-0">
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid gap-1 px-14 py-3 text-xs">
                  <p className="text-ink2">
                    <span className="font-semibold text-ink">What this rule does: </span>
                    {c.description}
                  </p>
                  <p className="text-ink2">
                    <span className="font-semibold text-ink">Outcome: </span>
                    {c.detail}
                  </p>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
