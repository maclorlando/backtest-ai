"use client";
import React from "react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";
import ComparisonTooltip from "@/components/tooltips/ComparisonTooltip";

type SeriesInfo = { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } };

export default function ComparisonChart({ data, lines }: { data: Array<Record<string, number | string>>; lines: SeriesInfo[] }) {
  return (
    <div className="w-full h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-primary))" opacity={0.3} />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 10, fill: "rgb(var(--fg-secondary))" }}
            axisLine={{ stroke: "rgb(var(--border-primary))" }}
            tickLine={{ stroke: "rgb(var(--border-primary))" }}
          />
          <YAxis 
            tick={{ fontSize: 10, fill: "rgb(var(--fg-secondary))" }}
            domain={["auto", "auto"]}
            axisLine={{ stroke: "rgb(var(--border-primary))" }}
            tickLine={{ stroke: "rgb(var(--border-primary))" }}
          />
          <Tooltip content={<ComparisonTooltip lines={lines} />} />
          <Legend />
          {lines.map((ln) => (
            <Line 
              key={ln.key} 
              type="monotone" 
              dataKey={ln.key} 
              name={ln.name} 
              stroke={ln.color} 
              dot={false} 
              strokeWidth={2} 
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


