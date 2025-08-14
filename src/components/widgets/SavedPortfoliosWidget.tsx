"use client";
import React from "react";
import { IconX } from "@tabler/icons-react";
import { ASSET_ID_TO_SYMBOL, type AssetId } from "@/lib/types";

type AllocationRow = { id: AssetId; allocation: number };

type SavedRecord = {
  allocations: AllocationRow[];
  start: string; 
  end: string; 
  mode: "none" | "periodic" | "threshold";
  periodDays?: number; 
  thresholdPct?: number; 
  initialCapital: number;
  kpis?: {
    finalValue: number;
    retPct: number;
    cagrPct: number;
    volPct: number;
    maxDdPct: number;
    rr: number | null;
  };
};

interface SavedPortfoliosWidgetProps {
  saved: Record<string, SavedRecord>;
  setSaved: (saved: Record<string, SavedRecord>) => void;
  onLoadPortfolio: (cfg: SavedRecord) => void;
  onCompareAll: () => void;
  mounted: boolean;
}

export default function SavedPortfoliosWidget({
  saved,
  setSaved,
  onLoadPortfolio,
  onCompareAll,
  mounted
}: SavedPortfoliosWidgetProps) {
  const handleDeletePortfolio = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next: Record<string, SavedRecord> = { ...saved };
    delete next[name];
    setSaved(next);
    localStorage.setItem("bt_portfolios", JSON.stringify(next));
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Saved Portfolios</h3>
        <button
          onClick={onCompareAll}
          disabled={!mounted || Object.keys(saved).length === 0}
          className="btn btn-secondary"
        >
          Compare All
        </button>
      </div>
      
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {Object.entries(saved).map(([name, cfg]) => (
          <div
            key={name}
            className="p-3 bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-primary))] rounded-lg cursor-pointer hover:border-[rgb(var(--border-secondary))] transition-colors"
            onClick={() => onLoadPortfolio(cfg)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-[rgb(var(--fg-primary))]">{name}</span>
              <button
                onClick={(e) => handleDeletePortfolio(name, e)}
                className="icon-btn"
                title="Delete portfolio"
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-1">
              {cfg.allocations.map((a) => `${ASSET_ID_TO_SYMBOL[a.id]} ${(a.allocation * 100).toFixed(1)}%`).join(" • ")}
            </div>
            <div className="text-xs text-[rgb(var(--fg-secondary))] mb-1">
              {cfg.start} → {cfg.end} • Cap: ${cfg.initialCapital}
            </div>
            {cfg.kpis && (
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span>CAGR: {cfg.kpis.cagrPct.toFixed(2)}%</span>
                <span>Vol: {cfg.kpis.volPct.toFixed(2)}%</span>
                <span>MaxDD: {cfg.kpis.maxDdPct.toFixed(2)}%</span>
                <span>R:R: {cfg.kpis.rr == null ? "—" : cfg.kpis.rr.toFixed(2)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
