"use client";

import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

export function PerformanceChart({ data }: { data: { month: string; score: number }[] }) {
  const avg = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);
  const peak = data.reduce((max, d) => (d.score > max.score ? d : max), data[0]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Team Performance</h3>
        <button className="flex items-center gap-1 text-xs font-medium text-ink-muted">
          This year <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
            <YAxis domain={[50, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
            <ReferenceLine y={avg} stroke="#16171A" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Avg ${avg}%`, position: "insideTopLeft", fontSize: 11, fill: "#16171A" }} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #E7E7E1", fontSize: 12 }}
            />
            <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={28}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.month === peak.month ? "#E8E24A" : "#EFEFEA"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
