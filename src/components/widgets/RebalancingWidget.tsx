"use client";
import React from "react";

interface RebalancingWidgetProps {
  mode: "none" | "periodic" | "threshold";
  setMode: (mode: "none" | "periodic" | "threshold") => void;
  periodDays: number;
  setPeriodDays: (days: number) => void;
  thresholdPct: number;
  setThresholdPct: (pct: number) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  allocationSum: number;
}

export default function RebalancingWidget({
  mode,
  setMode,
  periodDays,
  setPeriodDays,
  thresholdPct,
  setThresholdPct,
  onRun,
  loading,
  error,
  allocationSum
}: RebalancingWidgetProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Rebalancing</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Strategy</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "none" | "periodic" | "threshold")}
            className="input w-full"
          >
            <option value="none">No Rebalancing</option>
            <option value="periodic">Periodic (days)</option>
            <option value="threshold">Threshold (%)</option>
          </select>
        </div>
        
        {mode === "periodic" && (
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Period (days)</label>
            <input
              type="number"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value) || 30)}
              min={1}
              className="input w-full"
            />
          </div>
        )}
        
        {mode === "threshold" && (
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Threshold (%)</label>
            <input
              type="number"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value) || 5)}
              min={1}
              className="input w-full"
            />
          </div>
        )}
        
        <button
          onClick={onRun}
          disabled={Math.abs(allocationSum - 1) > 1e-4 || loading}
          className="btn btn-primary w-full"
        >
          {loading ? "Running Backtest..." : "Run Backtest"}
        </button>
        
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
