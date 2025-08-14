"use client";
import React from "react";

type TooltipPayloadItem = { dataKey: string; value: number; color?: string; name?: string };
type TooltipProps = { active?: boolean; payload?: TooltipPayloadItem[]; label?: string };

export default function PortfolioTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload.find((p) => p.dataKey === "value")?.value;
  const invested = payload.find((p) => p.dataKey === "invested")?.value;
  const growth = value && invested ? ((value / invested - 1) * 100).toFixed(2) : "";
  const assetItems = payload.filter((p) => (p.dataKey || "").endsWith("_price"));
  return (
    <div className="tooltip">
      <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <div className="badge">Portfolio</div>
        <div className="font-semibold">{typeof value === "number" ? value.toFixed(2) : value}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="badge">Invested</div>
        <div>{typeof invested === "number" ? invested.toFixed(2) : invested}</div>
      </div>
      {growth && <div className="text-xs text-[rgb(var(--fg-tertiary))]">Growth: {growth}%</div>}
      {assetItems.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold mb-1">Assets</div>
          <div className="grid grid-cols-1 gap-1">
            {assetItems.map((it) => {
              const id = (it.dataKey || "").replace("_price", "");
              // weights are not included in this generic tooltip; parent may provide if needed
              return (
                <div key={id} className="flex items-center justify-between">
                  <span className="text-xs">{id} price</span>
                  <span className="text-xs font-mono">{typeof it.value === "number" ? it.value.toFixed(4) : it.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


