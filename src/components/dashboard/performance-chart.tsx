"use client";

import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { Card } from "@/components/ui/card";

/** Company-wide attendance rate per month of the current year. */
export function PerformanceChart({ data }: { data: { month: string; rate: number | null }[] }) {
  const points = data.filter((d): d is { month: string; rate: number } => d.rate != null);
  const avg = points.length ? Math.round(points.reduce((s, d) => s + d.rate, 0) / points.length) : 0;
  const peak = points.reduce<{ month: string; rate: number } | null>((max, d) => (!max || d.rate > max.rate ? d : max), null);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Monthly Attendance</h3>
        <span className="text-xs font-medium text-ink-muted">This year</span>
      </div>
      <div className="h-64">
        {points.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-faint">Data will appear once attendance is recorded.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 24, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
              <ReferenceLine y={avg} stroke="#16171A" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Avg ${avg}%`, position: "insideTopLeft", fontSize: 11, fill: "#16171A" }} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.03)" }}
                formatter={(v) => [`${v}%`, "Attendance"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #E7E7E1", fontSize: 12 }}
              />
              <Bar dataKey="rate" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {points.map((d) => (
                  <Cell key={d.month} fill={d.month === peak?.month ? "#273992" : "#E9ECF8"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
