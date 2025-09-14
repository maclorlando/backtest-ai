"use client";
import React, { useState } from "react";
import Image from "next/image";
import { ASSET_ID_TO_SYMBOL, type AssetId } from "@/lib/types";
import { IconTrash, IconChartLine, IconDownload, IconUpload, IconPlus, IconEye } from "@tabler/icons-react";

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
  logos?: Record<string, string>;
  comparing?: boolean;
}

export default function SavedPortfoliosWidget({
  saved,
  setSaved,
  onLoadPortfolio,
  onCompareAll,
  mounted,
  logos = {},
  comparing = false
}: SavedPortfoliosWidgetProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const deletePortfolio = (name: string) => {
    const newSaved = { ...saved };
    delete newSaved[name];
    setSaved(newSaved);
    localStorage.setItem("bt_portfolios", JSON.stringify(newSaved));
    setShowDeleteConfirm(null);
  };

  const exportPortfolios = () => {
    const dataStr = JSON.stringify(saved, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `portfolios-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importPortfolios = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        const merged = { ...saved, ...imported };
        setSaved(merged);
        localStorage.setItem("bt_portfolios", JSON.stringify(merged));
      } catch (error) {
        console.error("Failed to import portfolios:", error);
      }
    };
    reader.readAsText(file);
  };

  const getPortfolioStats = (portfolio: SavedRecord) => {
    const totalAllocation = portfolio.allocations.reduce((sum, asset) => sum + asset.allocation, 0);
    const assetCount = portfolio.allocations.length;
    const hasKpis = portfolio.kpis && portfolio.kpis.finalValue > 0;
    
    return {
      totalAllocation: (totalAllocation * 100).toFixed(1),
      assetCount,
      hasKpis,
      finalValue: portfolio.kpis?.finalValue || 0,
      returnPct: portfolio.kpis?.retPct || 0,
      cagrPct: portfolio.kpis?.cagrPct || 0,
      maxDrawdown: portfolio.kpis?.maxDdPct || 0
    };
  };

  const getTopAssets = (portfolio: SavedRecord, count: number = 3) => {
    return portfolio.allocations
      .sort((a, b) => b.allocation - a.allocation)
      .slice(0, count);
  };

  if (!mounted) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Saved Portfolios</h3>
        <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
          Loading...
        </div>
      </div>
    );
  }

  const portfolioEntries = Object.entries(saved);

  return (
    <div className="card widget-compact">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Saved Portfolios</h3>
        <div className="text-right">
          <div className="text-sm text-[rgb(var(--fg-secondary))]">Total Saved</div>
          <div className="text-lg font-semibold text-[rgb(var(--fg-primary))]">{portfolioEntries.length}</div>
        </div>
      </div>

      {/* Portfolio Cards */}
      <div className="space-y-3 mb-6">
        {portfolioEntries.length === 0 ? (
          <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
            No saved portfolios. Create and save portfolios to see them here.
          </div>
        ) : (
          portfolioEntries.map(([name, portfolio], index) => {
            const stats = getPortfolioStats(portfolio);
            const topAssets = getTopAssets(portfolio);
            const isAllocationValid = Math.abs(parseFloat(stats.totalAllocation) - 100) < 0.1;

            return (
              <div key={`${name}-${index}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))] gap-4 hover:bg-[rgb(var(--bg-tertiary))] transition-colors">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {/* Portfolio Icon */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-[rgb(var(--bg-tertiary))] flex items-center justify-center flex-shrink-0">
                    <IconChartLine size={24} className="text-[rgb(var(--accent-primary))]" />
                  </div>

                  {/* Portfolio Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-2">
                      <span className="font-semibold text-[rgb(var(--fg-primary))] truncate">
                        {name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[rgb(var(--fg-tertiary))]">
                          {stats.assetCount} assets
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${isAllocationValid ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'}`}>
                          {stats.totalAllocation}% allocated
                        </span>
                      </div>
                    </div>

                    {/* Top Assets */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-[rgb(var(--fg-secondary))]">Top assets:</span>
                      <div className="flex items-center gap-1">
                        {topAssets.map((asset, assetIndex) => {
                          const symbol = ASSET_ID_TO_SYMBOL[asset.id];
                          const logo = logos[asset.id];
                          return (
                            <div key={`${asset.id}-${assetIndex}`} className="flex items-center gap-1">
                              <div className="w-4 h-4 rounded-full overflow-hidden bg-[rgb(var(--bg-tertiary))] flex items-center justify-center">
                                {logo ? (
                                  <Image
                                    src={logo}
                                    alt={symbol}
                                    width={12}
                                    height={12}
                                    className="w-3 h-3"
                                  />
                                ) : (
                                  <span className="text-xs font-semibold text-[rgb(var(--accent-primary))]">
                                    {symbol.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-[rgb(var(--fg-secondary))]">
                                {symbol} ({(asset.allocation * 100).toFixed(0)}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Performance Stats */}
                    {stats.hasKpis && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-[rgb(var(--fg-tertiary))]">Final Value</div>
                          <div className="font-semibold text-[rgb(var(--fg-primary))]">
                            ${stats.finalValue.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[rgb(var(--fg-tertiary))]">Return</div>
                          <div className={`font-semibold ${stats.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[rgb(var(--fg-tertiary))]">CAGR</div>
                          <div className={`font-semibold ${stats.cagrPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.cagrPct >= 0 ? '+' : ''}{stats.cagrPct.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[rgb(var(--fg-tertiary))]">Max DD</div>
                          <div className="font-semibold text-red-400">
                            {stats.maxDrawdown.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onLoadPortfolio(portfolio)}
                    className="btn btn-primary btn-sm"
                    title="Load Portfolio"
                  >
                    <IconEye size={14} />
                    Load
                  </button>
                  
                  <button
                    onClick={() => setShowDeleteConfirm(name)}
                    className="btn btn-secondary btn-sm text-red-400 hover:text-red-300"
                    title="Delete Portfolio"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-4 space-y-3">
        {portfolioEntries.length > 0 && (
          <div className="p-3 bg-[rgb(var(--bg-tertiary))] rounded-lg border border-[rgb(var(--border-primary))]">
            <button
              onClick={onCompareAll}
              disabled={comparing}
              className="btn btn-secondary w-full"
            >
              {comparing ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Comparing...
                </div>
              ) : (
                <>
                  <IconChartLine size={16} />
                  Compare All Portfolios
                </>
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-[rgb(var(--bg-tertiary))] rounded-lg border border-[rgb(var(--border-primary))]">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                onChange={importPortfolios}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-2 text-sm">
                <IconUpload size={16} />
                Import
              </div>
            </label>
          </div>

          <div className="p-3 bg-[rgb(var(--bg-tertiary))] rounded-lg border border-[rgb(var(--border-primary))]">
            <button
              onClick={exportPortfolios}
              disabled={portfolioEntries.length === 0}
              className="w-full flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              <IconDownload size={16} />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-primary))] p-6 rounded-lg border border-[rgb(var(--border-primary))] max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">
              Delete Portfolio
            </h3>
            <p className="text-[rgb(var(--fg-secondary))] mb-6">
              Are you sure you want to delete &quot;{showDeleteConfirm}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePortfolio(showDeleteConfirm)}
                className="btn btn-primary flex-1 bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
