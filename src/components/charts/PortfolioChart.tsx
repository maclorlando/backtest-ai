"use client";
import React from "react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";
import PortfolioTooltip from "@/components/tooltips/PortfolioTooltip";

export default function PortfolioChart({ data }: { data: Array<Record<string, number | string>> }) {
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
          <Tooltip content={<PortfolioTooltip />} />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="rgb(var(--accent-primary))" 
            dot={false} 
            name="Portfolio" 
            strokeWidth={2} 
          />
          <Line 
            type="monotone" 
            dataKey="invested" 
            stroke="rgb(var(--fg-secondary))" 
            dot={false} 
            name="Invested" 
            strokeDasharray="4 4" 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


