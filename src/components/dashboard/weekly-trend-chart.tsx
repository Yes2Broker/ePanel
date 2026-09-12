"use client";

import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip, Dot } from "recharts";
import { Card } from "@/components/ui/card";

export function WeeklyTrendChart({ data }: { data: { day: string; score: number }[] }) {
  const peak = data.reduce((max, d) => (d.score > max.score ? d : max), data[0]);

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink">Weekly Attendance Score</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#A3A49C" }} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E7E7E1", fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#16171A"
              strokeWidth={2}
              dot={(props: any) =>
                props.payload.day === peak.day ? (
                  <Dot key={props.payload.day} cx={props.cx} cy={props.cy} r={4} fill="#E8E24A" stroke="#16171A" strokeWidth={1.5} />
                ) : (
                  <Dot key={props.payload.day} cx={props.cx} cy={props.cy} r={2.5} fill="#16171A" />
                )
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
