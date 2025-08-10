"use client";
import React from "react";
import { Card } from "@mantine/core";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";
import ComparisonTooltip from "@/components/tooltips/ComparisonTooltip";

type SeriesInfo = { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } };

export default function ComparisonChart({ data, lines }: { data: Array<Record<string, number | string>>; lines: SeriesInfo[] }) {
  return (
    <Card withBorder shadow="sm" padding="sm" style={{ height: 384 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip content={<ComparisonTooltip lines={lines} />} />
          <Legend />
          {lines.map((ln) => (
            <Line key={ln.key} type="monotone" dataKey={ln.key} name={ln.name} stroke={ln.color} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}


