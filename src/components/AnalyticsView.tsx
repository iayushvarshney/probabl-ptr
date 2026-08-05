"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsChart, AnalyticsRange, AnalyticsSnapshot } from "@/lib/analytics";
import { cn } from "@/lib/utils";

// Kept local (not imported from "@/lib/analytics") so this client component
// never pulls that server-only module — and its supabase import — into the
// browser bundle.
const ANALYTICS_RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

const KNOWN_COLOR = "#1e22aa"; // persian-blue — field is populated
const UNKNOWN_COLOR = "#a1a1aa"; // zinc-400 — field is missing, shown not dropped
const MAX_VISIBLE_BUCKETS = 8;

type DisplayBucket = { label: string; count: number; isUnknown: boolean };

/** Caps the chart to the top N known buckets (folding the rest into "Other")
 * so a long tail of one-off values doesn't make the chart unreadable. The
 * Unknown bucket is never folded — it always stays visible on its own so
 * missing-data coverage is never obscured by the cap. */
function toDisplayBuckets(chart: AnalyticsChart): { buckets: DisplayBucket[]; hiddenCount: number } {
  const known = chart.buckets.filter((b) => !b.isUnknown);
  const unknown = chart.buckets.find((b) => b.isUnknown);

  if (known.length <= MAX_VISIBLE_BUCKETS) {
    return { buckets: [...known, ...(unknown ? [unknown] : [])], hiddenCount: 0 };
  }

  const visible = known.slice(0, MAX_VISIBLE_BUCKETS);
  const rest = known.slice(MAX_VISIBLE_BUCKETS);
  const otherCount = rest.reduce((sum, b) => sum + b.count, 0);

  const buckets: DisplayBucket[] = [...visible];
  if (otherCount > 0) {
    buckets.push({ label: `Other (${rest.length})`, count: otherCount, isUnknown: false });
  }
  if (unknown) buckets.push(unknown);

  return { buckets, hiddenCount: rest.length };
}

function CoverageNote({ chart, noun }: { chart: AnalyticsChart; noun: string }) {
  if (chart.total === 0) {
    return <p className="mt-1 text-xs text-zinc-400">No {noun} in this range yet.</p>;
  }
  const pct = Math.round((chart.populated / chart.total) * 100);
  return (
    <p className="mt-1 text-xs text-zinc-400">
      Based on {chart.populated} of {chart.total} {noun} with this field populated ({pct}%) ·{" "}
      {chart.unknown} unknown
    </p>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DisplayBucket }> }) {
  if (!active || !payload?.length) return null;
  const { label, count } = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-zinc-900">{label}</div>
      <div className="text-zinc-500">
        {count} {count === 1 ? "record" : "records"}
      </div>
    </div>
  );
}

function AnalyticsBarCard({ title, chart, noun }: { title: string; chart: AnalyticsChart; noun: string }) {
  const { buckets, hiddenCount } = useMemo(() => toDisplayBuckets(chart), [chart]);
  const height = Math.max(160, buckets.length * 34 + 16);

  return (
    <Card className="rounded-2xl border border-zinc-200 p-4 shadow-none ring-0">
      <CardHeader className="p-0">
        <CardTitle className="text-sm font-semibold text-zinc-900">{title}</CardTitle>
        <CoverageNote chart={chart} noun={noun} />
      </CardHeader>
      <CardContent className="p-0 pt-3">
        {buckets.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-400">No data yet.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={buckets} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "#52525b" }}
                  interval={0}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(30,34,170,0.05)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {buckets.map((bucket, i) => (
                    <Cell key={i} fill={bucket.isUnknown ? UNKNOWN_COLOR : KNOWN_COLOR} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "#3f3f46", fontWeight: 500 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {hiddenCount > 0 && (
              <p className="mt-1.5 text-xs text-zinc-400">
                +{hiddenCount} more categor{hiddenCount === 1 ? "y" : "ies"} grouped into &ldquo;Other&rdquo;
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsView({ data }: { data: Record<AnalyticsRange, AnalyticsSnapshot> }) {
  const [range, setRange] = useState<AnalyticsRange>("all");
  const snapshot = data[range];
  const ranges = Object.keys(ANALYTICS_RANGE_LABELS) as AnalyticsRange[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {ranges.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn(
              "rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              range === r ? "bg-persian-blue text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            {ANALYTICS_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalyticsBarCard title="Industries" chart={snapshot.industries} noun="companies" />
        <AnalyticsBarCard title="Company size" chart={snapshot.companySize} noun="companies" />
        <AnalyticsBarCard title="Countries" chart={snapshot.countries} noun="companies" />
        <AnalyticsBarCard title="Job titles" chart={snapshot.jobTitles} noun="contacts" />
      </div>
    </div>
  );
}
