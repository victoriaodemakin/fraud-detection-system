"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const tooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    boxShadow: "var(--shadow)",
    fontSize: 12,
    color: "var(--ink)",
  },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--brand-soft)", opacity: 0.5 },
};

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

export interface Series {
  key: string;
  label: string;
  color?: string;
}

export function TrendChart({
  data,
  xKey,
  series,
  height = 260,
  stacked,
  yFormat,
  kind = "area",
}: {
  data: object[];
  xKey: string;
  series: Series[];
  height?: number;
  stacked?: boolean;
  yFormat?: (v: number) => string;
  kind?: "area" | "line";
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? CHART_COLORS[i % 5]} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color ?? CHART_COLORS[i % 5]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} tickFormatter={yFormat} width={48} />
          <Tooltip {...tooltipStyle} formatter={(v) => (yFormat ? yFormat(Number(v)) : v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS[i % 5]}
              strokeWidth={2}
              fill={`url(#${uid}-${s.key})`}
              stackId={stacked ? "a" : undefined}
              animationDuration={900}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} tickFormatter={yFormat} width={48} />
          <Tooltip {...tooltipStyle} formatter={(v) => (yFormat ? yFormat(Number(v)) : v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS[i % 5]} strokeWidth={2.2} dot={false} animationDuration={900} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 260,
  stacked,
  horizontal,
  yFormat,
  colorByIndex,
  cellColors,
}: {
  data: object[];
  xKey: string;
  series: Series[];
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  yFormat?: (v: number) => string;
  colorByIndex?: boolean;
  cellColors?: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 8 : -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} tickFormatter={yFormat} />
            <YAxis type="category" dataKey={xKey} {...axis} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...axis} />
            <YAxis {...axis} tickFormatter={yFormat} width={48} />
          </>
        )}
        <Tooltip {...tooltipStyle} formatter={(v) => (yFormat ? yFormat(Number(v)) : v)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? CHART_COLORS[i % 5]} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} stackId={stacked ? "a" : undefined} animationDuration={900} barSize={horizontal ? 14 : undefined}>
            {(colorByIndex || cellColors) && data.map((_, idx) => <Cell key={idx} fill={cellColors?.[idx] ?? CHART_COLORS[idx % 5]} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 220,
  center,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  center?: { label: string; value: string };
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none" animationDuration={900}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % 5]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-ink tabular-nums">{center?.value ?? total.toLocaleString()}</span>
        <span className="text-[11px] text-muted">{center?.label ?? "total"}</span>
      </div>
    </div>
  );
}

export function Legend2({ items }: { items: { name: string; value?: string | number; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink2">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.name}
          {i.value !== undefined && <span className="font-semibold text-ink">{i.value}</span>}
        </span>
      ))}
    </div>
  );
}

// Semi-circular risk gauge (0-100) with the tier bands drawn behind the needle.
export function RiskGauge({ score, lowMax = 30, mediumMax = 65, size = 220 }: { score: number; lowMax?: number; mediumMax?: number; size?: number }) {
  const r = 84;
  const cx = 110;
  const cy = 110;
  const polar = (v: number) => {
    const a = Math.PI - (v / 100) * Math.PI;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = polar(from);
    const [x2, y2] = polar(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const [nx, ny] = polar(Math.min(100, Math.max(0, score)));
  const tier = score <= lowMax ? "Low" : score <= mediumMax ? "Medium" : "High";
  const color = tier === "Low" ? "var(--success)" : tier === "Medium" ? "var(--warn)" : "var(--danger)";
  return (
    <div className="relative mx-auto" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 220 130" width="100%" height="100%">
        <path d={arc(0, lowMax)} stroke="var(--success)" strokeWidth={16} fill="none" strokeLinecap="butt" opacity={0.35} />
        <path d={arc(lowMax, mediumMax)} stroke="var(--warn)" strokeWidth={16} fill="none" opacity={0.35} />
        <path d={arc(mediumMax, 100)} stroke="var(--danger)" strokeWidth={16} fill="none" opacity={0.35} />
        <path d={arc(0, Math.max(0.5, score))} stroke={color} strokeWidth={16} fill="none" strokeLinecap="round" />
        <circle cx={nx} cy={ny} r={7} fill="var(--surface)" stroke={color} strokeWidth={3} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums text-ink">{score}</span>
        <span className="text-xs font-medium" style={{ color }}>
          {tier} risk
        </span>
      </div>
    </div>
  );
}
