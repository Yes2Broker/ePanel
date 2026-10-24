"use client";

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Dot } from "recharts";
import { Card } from "@/components/ui/card";

/** Share of active employees who came in, for each of the last working days. */
export function WeeklyTrendChart({ data }: { data: { date: string; day: string; rate: number }[] }) {
  const peak = data.reduce<(typeof data)[number] | null>((max, d) => (!max || d.rate > max.rate ? d : max), null);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink">Daily Attendance — last 7 working days</h3>
      <div className="h-56">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-faint">No attendance recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 24, right: 12, left: -28, bottom: 0 }}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Present"]}
                labelFormatter={(_, p) => p?.[0]?.payload?.date ?? ""}
                contentStyle={{ borderRadius: 12, border: "1px solid #E7E7E1", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#16171A"
                strokeWidth={2}
                dot={(props: any) =>
                  props.payload.date === peak?.date ? (
                    <Dot key={props.payload.date} cx={props.cx} cy={props.cy} r={4} fill="#273992" stroke="#16171A" strokeWidth={1.5} />
                  ) : (
                    <Dot key={props.payload.date} cx={props.cx} cy={props.cy} r={2.5} fill="#16171A" />
                  )
                }
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
