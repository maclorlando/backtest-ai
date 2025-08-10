"use client";
import React from "react";
import { Card } from "@mantine/core";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";
import PortfolioTooltip from "@/components/tooltips/PortfolioTooltip";

export default function PortfolioChart({ data }: { data: Array<Record<string, number | string>> }) {
  return (
    <Card withBorder shadow="sm" padding="sm" style={{ height: 384 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip content={<PortfolioTooltip />} />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#60a5fa" dot={false} name="Portfolio" strokeWidth={2} />
          <Line type="monotone" dataKey="invested" stroke="#94a3b8" dot={false} name="Invested" strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}


