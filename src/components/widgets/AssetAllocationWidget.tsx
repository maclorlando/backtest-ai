"use client";
import React from "react";
import { IconX, IconPlus, IconDeviceFloppy } from "@tabler/icons-react";
import { ASSET_ID_TO_SYMBOL, type AssetId } from "@/lib/types";

type AllocationRow = { id: AssetId; allocation: number };

interface AssetAllocationWidgetProps {
  allocations: AllocationRow[];
  setAllocations: (allocations: AllocationRow[]) => void;
  spot: Record<string, number>;
  onSave: () => void;
  allocationSum: number;
}

export default function AssetAllocationWidget({
  allocations,
  setAllocations,
  spot,
  onSave,
  allocationSum
}: AssetAllocationWidgetProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Assets & Allocations</h3>
        <button
          onClick={() => setAllocations([...allocations, { id: "bitcoin", allocation: 0 }])}
          className="icon-btn"
          title="Add Asset"
        >
          <IconPlus size={16} />
        </button>
      </div>
      
      <div className="space-y-3">
        {allocations.map((row, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="flex-1">
              <select
                value={row.id}
                onChange={(e) => {
                  const val = e.target.value as AssetId;
                  const copy = [...allocations];
                  copy[idx] = { ...row, id: val };
                  setAllocations(copy);
                }}
                className="input w-full"
              >
                {([
                  "usd-coin",
                  "bitcoin",
                  "ethereum",
                  "solana",
                  "tether",
                  "pepe",
                  "polkadot",
                  "aave",
                  "chainlink",
                  "fartcoin",
                ] as AssetId[]).map((id) => (
                  <option key={id} value={id}>
                    {ASSET_ID_TO_SYMBOL[id]} - ${spot[id]?.toFixed(4) || "0.0000"}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="number"
              value={row.allocation}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isNaN(next)) return;
                const copy = [...allocations];
                const sumOthers = allocations.reduce((s, a, i) => (i === idx ? s : s + a.allocation), 0);
                const allowed = Math.max(0, 1 - sumOthers);
                const clamped = Math.min(Math.max(next, 0), allowed);
                const rounded = Math.round(clamped * 10000) / 10000;
                if (rounded === row.allocation) return;
                copy[idx] = { ...row, allocation: rounded };
                setAllocations(copy);
              }}
              min={0}
              max={1}
              step={0.001}
              className="input w-20 text-center"
            />
            <button
              onClick={() => setAllocations(allocations.filter((_, i) => i !== idx))}
              className="icon-btn"
              title="Remove Asset"
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-[rgb(var(--border-primary))]">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[rgb(var(--fg-secondary))]">Total Allocation:</span>
          <span className={`font-semibold ${Math.abs(allocationSum - 1) > 1e-4 ? 'text-red-400' : 'text-green-400'}`}>
            {(allocationSum * 100).toFixed(2)}%
          </span>
        </div>
        <button
          onClick={onSave}
          className="btn btn-secondary w-full mt-3"
        >
          <IconDeviceFloppy size={16} />
          Save Portfolio
        </button>
      </div>
    </div>
  );
}
