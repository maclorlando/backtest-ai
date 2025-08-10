"use client";
import React from "react";

type SeriesInfo = { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } };
type TooltipPayloadItem = { dataKey: string; value: number; color?: string; name?: string };
type TooltipProps = { active?: boolean; payload?: TooltipPayloadItem[]; label?: string; lines: SeriesInfo[] };

export default function ComparisonTooltip({ active, payload, label, lines }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tooltip-card">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="grid grid-cols-1 gap-1">
        {lines.map((ln) => {
          const item = payload.find((p) => p.dataKey === ln.key);
          const v = item?.value;
          return (
            <div key={ln.key} className="flex items-center justify-between gap-3">
              <div className="chip" style={{ background: `${ln.color}20`, color: ln.color }}>{ln.name}</div>
              <div className="font-semibold">{typeof v === "number" ? v.toFixed(2) : v}</div>
              <div className="text-xs text-slate-500">
                CAGR {ln.kpis.cagrPct.toFixed(2)}% · Vol {ln.kpis.volPct.toFixed(2)}% · MaxDD {ln.kpis.maxDdPct.toFixed(2)}% · R:R {ln.kpis.rr == null ? "—" : ln.kpis.rr.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


