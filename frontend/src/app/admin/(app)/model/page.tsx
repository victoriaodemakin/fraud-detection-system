"use client";

import { BrainCircuit, Download, FlaskConical, Info, ListChecks, Play, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { BarsChart, TrendChart } from "@/components/charts/charts";
import { Alert, EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, cn } from "@/components/ui/base";
import { StatCard, Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/data";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/lib/hooks";
import { ApiError, api, downloadFile } from "@/lib/http";
import { dateTime, num, pct } from "@/lib/format";

interface Det { tp: number; fp: number; tn: number; fn: number; precision: number; recall: number; f1: number; falsePositiveRate: number; accuracy: number }
interface RuleStat { code: string; name: string; category: string; triggeredOnFraud: number; triggeredOnLegit: number; precision: number; fraudCoverage: number; legitRate: number }
interface RunResult {
  seed: number; rows: number; fraudRows: number; legitimateRows: number; weights: { rule: number; ml: number }; bands: { lowMax: number; mediumMax: number };
  predictedFraudMeans: string;
  detectors: { rule: Det; ml: Det; hybrid: Det; logisticRegression: Det; decisionTree: Det };
  averageHybridScore: { fraud: number; legitimate: number };
  histogram: { fraud: number[]; legitimate: number[] };
  rules: RuleStat[];
}
interface Info {
  online: boolean;
  training: Record<string, unknown> | null;
  metrics: { test_set_size: number; test_set_fraud_count: number } | null;
  latest: { id: number; createdAt: string; createdBy: string; seed: number; rows: number; result: RunResult } | null;
}
interface RunItem { id: number; createdAt: string; createdBy: string; seed: number; rows: number; detectors: RunResult["detectors"] }
interface RunFull { id: number; createdAt: string; createdBy: string; seed: number; rows: number; result: RunResult }

const NAMES: [keyof RunResult["detectors"], string, string][] = [
  ["rule", "Rule-based only", "var(--chart-1)"],
  ["ml", "Machine learning only", "var(--chart-2)"],
  ["hybrid", "Hybrid framework", "var(--chart-3)"],
  ["logisticRegression", "Logistic regression only", "var(--chart-4)"],
  ["decisionTree", "Decision tree only", "var(--chart-5)"],
];

export default function ModelPage() {
  const toast = useToast();
  const info = useApi<Info>("admin", "/admin/model");
  const runs = useApi<RunItem[]>("admin", "/admin/model/runs");
  const [sel, setSel] = useState<RunFull | null>(null);
  const [seed, setSeed] = useState("42");
  const [rows, setRows] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const l = info.data?.latest;
    if (l && !sel) setSel({ id: l.id, createdAt: l.createdAt, createdBy: l.createdBy, seed: l.seed, rows: l.rows, result: l.result });
  }, [info.data, sel]);

  if (info.loading && !info.data) return <PageLoader />;
  if (info.error && !info.data) return <ErrorState message={info.error} onRetry={info.reload} />;
  if (!info.data) return null;
  const m = info.data;
  const res = sel?.result;

  async function evaluate() {
    setBusy(true);
    try {
      const r = await api<{ id: number }>("admin", "/admin/model/evaluate", { method: "POST", body: { seed: Number(seed) || 42, rows: rows ? Number(rows) : undefined } });
      setSel(await api<RunFull>("admin", `/admin/model/runs/${r.id}`));
      runs.reload();
      toast.success("Evaluation complete", `Run #${r.id} added to the history.`);
    } catch (e) {
      toast.error("Evaluation failed", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function open(id: number) {
    setSel(await api<RunFull>("admin", `/admin/model/runs/${id}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const cmp = res ? NAMES.map(([k, label, color]) => ({ key: k, label, color, d: res.detectors[k] })) : [];
  const sumF = res ? res.histogram.fraud.reduce((a, b) => a + b, 0) || 1 : 1;
  const sumL = res ? res.histogram.legitimate.reduce((a, b) => a + b, 0) || 1 : 1;
  const histData = res ? res.histogram.fraud.map((f, i) => ({ range: `${i * 10}-${i * 10 + 9}`, fraud: +((f / sumF) * 100).toFixed(1), legitimate: +((res.histogram.legitimate[i] / sumL) * 100).toFixed(1) })) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model performance & evaluation"
        subtitle="Compares the rule layer alone, the ML layer alone and the hybrid framework on the same held-out test set."
        actions={sel && <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => downloadFile("admin", `/admin/model/runs/${sel.id}/export`, `evaluation-run-${sel.id}.xlsx`).catch(() => toast.error("Export failed"))}>Export run to Excel</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ML service" value={m.online ? "Online" : "Offline"} icon={<Radio size={18} />} tone={m.online ? "success" : "danger"} hint="FastAPI, port 8000" />
        <StatCard label="Test set size" value={m.metrics?.test_set_size ?? 0} icon={<FlaskConical size={18} />} tone="purple" hint="held-out, never used for training" />
        <StatCard label="Fraud in test set" value={m.metrics?.test_set_fraud_count ?? 0} icon={<BrainCircuit size={18} />} tone="danger" />
        <StatCard label="Latest run" value={sel ? `#${sel.id}` : "none"} icon={<ListChecks size={18} />} tone="blue" hint={sel ? `${num(sel.rows)} transactions · seed ${sel.seed}` : "run an evaluation below"} />
      </div>

      <Card>
        <CardHeader title="Run a new evaluation" subtitle="Rebuilds a banking context for each test transaction with a seeded generator, then scores it three ways." icon={<Play size={16} />} />
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Random seed" hint="The same seed reproduces the same run."><Input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} /></Field>
          <Field label="Rows (optional)" hint="Blank = the whole test set. A subsample keeps every fraud row."><Input type="number" value={rows} onChange={(e) => setRows(e.target.value)} placeholder="all" /></Field>
          <Button icon={<Play size={15} />} loading={busy} onClick={evaluate} disabled={!m.online}>Run evaluation</Button>
        </div>
        {!m.online && <div className="px-5 pb-5"><Alert tone="warn">The ML service is offline, so an evaluation cannot run. Start it on port 8000.</Alert></div>}
      </Card>

      {!res ? (
        <Card><EmptyState title="No evaluation runs yet" body="Run one above to see the three-way comparison." icon={<FlaskConical size={22} />} /></Card>
      ) : (
        <>
          <Alert tone="info" title={`Run #${sel!.id} · ${dateTime(sel!.createdAt)} · by ${sel!.createdBy}`}>
            {num(res.rows)} transactions ({num(res.fraudRows)} fraudulent, {num(res.legitimateRows)} legitimate). A transaction counts as <b>predicted fraud</b> when it lands in the {res.predictedFraudMeans.toLowerCase()}. Weights {res.weights.rule} rule / {res.weights.ml} ML; bands Low ≤ {res.bands.lowMax}, Medium ≤ {res.bands.mediumMax}.
          </Alert>

          <Card>
            <CardHeader title="Three-way comparison" subtitle="Rule-based only vs machine learning only vs the hybrid framework" icon={<BrainCircuit size={16} />} />
            <TableWrap>
              <Table>
                <THead><tr><TH>Detector</TH><TH>Precision</TH><TH>Recall</TH><TH>F1</TH><TH>False positive rate</TH><TH>Accuracy</TH><TH>Caught / missed</TH></tr></THead>
                <tbody>
                  {cmp.map(({ key, label, d }) => (
                    <TR key={key} className={key === "hybrid" ? "bg-brandsoft/50" : ""}>
                      <TD className="font-medium text-ink">{label} {key === "hybrid" && <Badge tone="purple">framework</Badge>}</TD>
                      <TD className="tabular-nums">{pct(d.precision)}</TD><TD className="tabular-nums">{pct(d.recall)}</TD><TD className="tabular-nums font-semibold text-ink">{d.f1.toFixed(3)}</TD>
                      <TD className="tabular-nums">{pct(d.falsePositiveRate, 2)}</TD><TD className="tabular-nums">{pct(d.accuracy, 2)}</TD>
                      <TD className="whitespace-nowrap text-xs"><span className="font-semibold text-success">{d.tp}</span> caught · <span className="font-semibold text-danger">{d.fn}</span> missed</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Precision, recall and F1" subtitle="Higher is better" />
              <div className="p-4">
                <BarsChart
                  data={cmp.map(({ label, d }) => ({ name: label.replace(" only", "").replace("Machine learning", "ML").replace("Logistic regression", "Log. reg."), precision: +(d.precision * 100).toFixed(1), recall: +(d.recall * 100).toFixed(1), f1: +(d.f1 * 100).toFixed(1) }))}
                  xKey="name"
                  series={[{ key: "precision", label: "Precision %" }, { key: "recall", label: "Recall %" }, { key: "f1", label: "F1 ×100" }]}
                  height={300}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Hybrid score distribution" subtitle={`Share of each class per score band. Average score: fraud ${res.averageHybridScore.fraud}, legitimate ${res.averageHybridScore.legitimate}`} />
              <div className="p-4">
                <TrendChart data={histData} xKey="range" series={[{ key: "legitimate", label: "Legitimate %", color: "var(--chart-2)" }, { key: "fraud", label: "Fraudulent %", color: "var(--danger)" }]} yFormat={(v) => `${v}%`} height={300} />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Confusion matrices" subtitle="Rows are what really happened, columns what the detector decided" />
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
              {cmp.map(({ key, label, d }) => (
                <div key={key} className={cn("rounded-2xl border p-4", key === "hybrid" ? "border-brand/40 bg-brandsoft/40" : "border-line")}>
                  <p className="mb-2 text-xs font-semibold text-ink">{label}</p>
                  <div className="grid grid-cols-2 gap-1.5 text-center text-xs">
                    <div className="rounded-lg bg-successsoft py-2"><p className="text-base font-semibold text-success">{num(d.tn)}</p><p className="text-muted">true neg.</p></div>
                    <div className="rounded-lg bg-warnsoft py-2"><p className="text-base font-semibold text-warn">{num(d.fp)}</p><p className="text-muted">false pos.</p></div>
                    <div className="rounded-lg bg-dangersoft py-2"><p className="text-base font-semibold text-danger">{num(d.fn)}</p><p className="text-muted">false neg.</p></div>
                    <div className="rounded-lg bg-brandsoft py-2"><p className="text-base font-semibold text-brand">{num(d.tp)}</p><p className="text-muted">true pos.</p></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Per-rule effectiveness" subtitle="How often each rule fired on fraudulent vs legitimate transactions" icon={<ListChecks size={16} />} />
            <TableWrap>
              <Table>
                <THead><tr><TH>Rule</TH><TH>On fraud</TH><TH>On legitimate</TH><TH>Precision</TH><TH>Fraud coverage</TH><TH>False alarm rate</TH></tr></THead>
                <tbody>
                  {[...res.rules].sort((a, b) => b.triggeredOnFraud + b.triggeredOnLegit - (a.triggeredOnFraud + a.triggeredOnLegit)).map((r) => (
                    <TR key={r.code}>
                      <TD><p className="font-medium text-ink"><span className="mr-2 rounded-md bg-brandsoft px-1.5 py-0.5 font-mono text-[11px] text-brand">{r.code}</span>{r.name}</p><p className="text-xs text-muted">{r.category}</p></TD>
                      <TD className="tabular-nums">{num(r.triggeredOnFraud)}</TD><TD className="tabular-nums">{num(r.triggeredOnLegit)}</TD>
                      <TD className="tabular-nums">{pct(r.precision)}</TD><TD className="tabular-nums">{pct(r.fraudCoverage)}</TD><TD className="tabular-nums">{pct(r.legitRate, 2)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Card>

          <Alert tone="warn" title="How to read these results" >
            <span className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0" /><span>The ML layer scores real samples from the public credit-card fraud dataset. The banking context (location, device, velocity and so on) around each transaction is generated from a documented scenario model, because no public dataset carries both. The rule-layer and hybrid figures therefore depend on those scenario assumptions and should be reported as such.</span></span>
          </Alert>
        </>
      )}

      {runs.data && runs.data.length > 0 && (
        <Card>
          <CardHeader title="Run history" subtitle="Click a run to load it" />
          <TableWrap>
            <Table>
              <THead><tr><TH>Run</TH><TH>When</TH><TH>By</TH><TH>Rows</TH><TH>Seed</TH><TH>Rule F1</TH><TH>ML F1</TH><TH>Hybrid F1</TH></tr></THead>
              <tbody>
                {runs.data.map((r) => (
                  <TR key={r.id} onClick={() => open(r.id)} className={sel?.id === r.id ? "bg-brandsoft/50" : ""}>
                    <TD className="font-semibold text-ink">#{r.id}</TD><TD className="whitespace-nowrap text-xs">{dateTime(r.createdAt)}</TD><TD>{r.createdBy}</TD><TD className="tabular-nums">{num(r.rows)}</TD><TD>{r.seed}</TD>
                    <TD className="tabular-nums">{r.detectors.rule.f1.toFixed(3)}</TD><TD className="tabular-nums">{r.detectors.ml.f1.toFixed(3)}</TD><TD className="tabular-nums font-semibold text-ink">{r.detectors.hybrid.f1.toFixed(3)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}

      {m.training && (
        <Card>
          <CardHeader title="Training details" subtitle="How the two ML models were trained" icon={<Info size={16} />} />
          <pre className="max-h-80 overflow-auto p-5 text-[11px] leading-relaxed text-ink2">{JSON.stringify(m.training, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
