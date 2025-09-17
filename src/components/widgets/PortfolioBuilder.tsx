"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ASSET_ID_TO_SYMBOL, type AssetId } from "@/lib/types";
import { IconPlus, IconX, IconDeviceFloppy, IconTrash, IconLoader2, IconRefresh } from "@tabler/icons-react";
import { dataService } from "@/lib/dataService";

type AllocationRow = { id: AssetId; allocation: number };

interface PortfolioBuilderProps {
  allocations: AllocationRow[];
  setAllocations: (allocations: AllocationRow[]) => void;
  spot: Record<string, number>;
  setSpot: (spot: Record<string, number>) => void;
  logos: Record<string, string>;
  setLogos: (logos: Record<string, string>) => void;
  initialCapital: number;
  setInitialCapital: (capital: number) => void;
  onSave: () => void;
  allocationSum: number;
  onLoadPortfolio?: (allocations: AllocationRow[]) => void;
}

export default function PortfolioBuilder({
  allocations,
  setAllocations,
  spot,
  setSpot,
  logos,
  setLogos,
  initialCapital,
  setInitialCapital,
  onSave,
  allocationSum,
  onLoadPortfolio
}: PortfolioBuilderProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempAllocation, setTempAllocation] = useState<string>("");
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingLogos, setLoadingLogos] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const totalValue = initialCapital * allocationSum;

  // Fetch current prices using centralized data service
  const fetchCurrentPrices = async (assetIds: AssetId[]) => {
    if (assetIds.length === 0) return;
    
    setLoadingPrices(true);
    setPriceError(null);
    
    try {
      const prices = await dataService.getCurrentPrices(assetIds);
      console.log('Fetched current prices:', prices);
      
      // Update parent component's spot prices state
      console.log('PortfolioBuilder: Updating spot prices:', prices);
      const updated = { ...spot, ...prices };
      console.log('PortfolioBuilder: New spot state:', updated);
      setSpot(updated);
      
    } catch (error) {
      console.error('Error fetching current prices:', error);
      setPriceError(error instanceof Error ? error.message : 'Failed to fetch prices');
    } finally {
      setLoadingPrices(false);
    }
  };

  // Fetch token logos using centralized data service
  const fetchTokenLogos = async (assetIds: AssetId[]) => {
    if (assetIds.length === 0) return;
    
    setLoadingLogos(true);
    setLogoError(null);
    
    try {
      const newLogos = await dataService.getTokenLogos(assetIds);
      console.log('Fetched token logos:', newLogos);
      
      // Update parent component's logos state
      setLogos({ ...logos, ...newLogos });
      
    } catch (error) {
      console.error('Error fetching token logos:', error);
      setLogoError(error instanceof Error ? error.message : 'Failed to fetch logos');
    } finally {
      setLoadingLogos(false);
    }
  };

  // Load common assets data on component mount
  useEffect(() => {
    const commonAssets: AssetId[] = [
      'bitcoin', 'ethereum', 'usd-coin', 'tether', 'solana',
      'pepe', 'polkadot', 'aave', 'chainlink', 'fartcoin',
      'wrapped-staked-ether', 'euro-coin'
    ];
    
    // Load prices and logos for all common assets immediately
    fetchCurrentPrices(commonAssets);
    fetchTokenLogos(commonAssets);
  }, []); // Run once on mount

  // Auto-fetch prices and logos when allocations change (with debouncing)
  useEffect(() => {
    const assetIds = allocations.map(a => a.id);
    if (assetIds.length > 0) {
      // Debounce the API calls to avoid excessive requests
      const timeoutId = setTimeout(() => {
        fetchCurrentPrices(assetIds);
        fetchTokenLogos(assetIds);
      }, 1000); // Wait 1 second after allocations change
      
      return () => clearTimeout(timeoutId);
    }
  }, [allocations]);

  const addAsset = () => {
    setAllocations([...allocations, { id: "bitcoin", allocation: 0 }]);
  };

  const removeAsset = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
    setEditingIndex(null);
  };

  const updateAsset = (index: number, field: 'id' | 'allocation', value: AssetId | number) => {
    const copy = [...allocations];
    copy[index] = { ...copy[index], [field]: value };
    setAllocations(copy);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setTempAllocation((allocations[index].allocation * 100).toFixed(1));
  };

  const saveEditing = (index: number) => {
    const newAllocation = parseFloat(tempAllocation) / 100;
    if (!isNaN(newAllocation) && newAllocation >= 0 && newAllocation <= 1) {
      updateAsset(index, 'allocation', newAllocation);
    }
    setEditingIndex(null);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
  };

  const handleAllocationChange = (index: number, value: string) => {
    setTempAllocation(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      // Calculate how much allocation is available (excluding current asset)
      const otherAllocations = allocations.reduce((sum, asset, i) => 
        i === index ? sum : sum + asset.allocation, 0
      );
      const maxAllowed = Math.max(0, 1 - otherAllocations);
      const clampedValue = Math.min(numValue / 100, maxAllowed);
      setTempAllocation((clampedValue * 100).toFixed(1));
    }
  };

  // Handle slider allocation changes
  const handleSliderChange = (index: number, value: number) => {
    const newAllocation = value / 100;
    updateAsset(index, 'allocation', newAllocation);
  };

  // Normalize allocations to ensure they sum to 100%
  const normalizeAllocations = () => {
    const total = allocations.reduce((sum, asset) => sum + asset.allocation, 0);
    if (total > 0) {
      const normalized = allocations.map(asset => ({
        ...asset,
        allocation: asset.allocation / total
      }));
      setAllocations(normalized);
    }
  };

  const availableAssets: AssetId[] = [
    "bitcoin", "ethereum", "solana", "usd-coin", "tether", 
    "pepe", "polkadot", "aave", "chainlink", "fartcoin",
    "wrapped-staked-ether", "euro-coin"
  ];

  return (
    <div className="card widget-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Portfolio Builder</h3>
        <div className="text-right">
          <div className="text-sm text-[rgb(var(--fg-secondary))]">Total Value</div>
          <div className="text-lg font-semibold text-[rgb(var(--fg-primary))]">${totalValue.toFixed(2)}</div>
        </div>
      </div>

      {/* Portfolio Composition Display */}
      <div className="space-y-2 mb-4">
        {allocations.length === 0 ? (
          <div className="text-center py-4 text-[rgb(var(--fg-secondary))]">
            No assets selected. Add assets to build your portfolio.
          </div>
        ) : (
          allocations.map((asset, index) => {
            const symbol = ASSET_ID_TO_SYMBOL[asset.id];
            const currentPrice = spot[asset.id] || 0;
            const allocationValue = initialCapital * asset.allocation;
            const allocationPercentage = (asset.allocation * 100).toFixed(1);
            const logo = logos[asset.id];
            const isEditing = editingIndex === index;

            return (
              <div key={`${asset.id}-${index}`} className="space-y-3">
                {/* Main Asset Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))] gap-2">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Asset Logo */}
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[rgb(var(--bg-tertiary))] flex items-center justify-center flex-shrink-0">
                      {logo ? (
                        <Image
                          src={logo}
                          alt={symbol}
                          width={24}
                          height={24}
                          className="w-6 h-6"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-[rgb(var(--accent-primary))] rounded-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-white">
                            {symbol.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Asset Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-semibold text-[rgb(var(--fg-primary))] truncate">
                          {symbol}
                        </span>
                        <span className="text-xs text-[rgb(var(--fg-tertiary))] hidden sm:inline">
                          {asset.id}
                        </span>
                      </div>
                      <div className="text-sm text-[rgb(var(--fg-secondary))]">
                        ${currentPrice.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {/* Allocation Controls */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          value={tempAllocation}
                          onChange={(e) => handleAllocationChange(index, e.target.value)}
                          onBlur={() => saveEditing(index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditing(index);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          min="0"
                          max="100"
                          step="0.1"
                          className="input w-16 text-center text-sm"
                          autoFocus
                        />
                        <span className="text-sm text-[rgb(var(--fg-secondary))]">%</span>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditing(index)}
                          className="font-semibold text-[rgb(var(--fg-primary))] text-lg hover:text-[rgb(var(--accent-primary))] transition-colors min-w-[3rem]"
                        >
                          {allocationPercentage}%
                        </button>
                        {currentPrice > 0 && (
                          <div className="text-sm text-[rgb(var(--fg-secondary))] min-w-[4rem]">
                            ${allocationValue.toFixed(2)}
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Remove Button */}
                    <button
                      onClick={() => removeAsset(index)}
                      className="icon-btn text-red-400 hover:text-red-300"
                      title="Remove Asset"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>

                  {/* Allocation Progress Bar */}
                  <div className="w-full sm:w-20 h-2 bg-[rgb(var(--bg-tertiary))] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[rgb(var(--accent-primary))] rounded-full transition-all duration-300"
                      style={{ width: `${asset.allocation * 100}%` }}
                    />
                  </div>

                  {currentPrice > 0 && (
                    <div className="text-xs text-[rgb(var(--fg-tertiary))] mt-1">
                      {(allocationValue / currentPrice).toFixed(4)} {symbol}
                    </div>
                  )}
                </div>

                {/* Allocation Slider */}
                <div className="px-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[rgb(var(--fg-secondary))] min-w-[2rem]">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={asset.allocation * 100}
                      onChange={(e) => handleSliderChange(index, parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-[rgb(var(--bg-tertiary))] rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, rgb(var(--accent-primary)) 0%, rgb(var(--accent-primary)) ${asset.allocation * 100}%, rgb(var(--bg-tertiary)) ${asset.allocation * 100}%, rgb(var(--bg-tertiary)) 100%)`
                      }}
                    />
                    <span className="text-xs text-[rgb(var(--fg-secondary))] min-w-[2rem] text-right">100%</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-[rgb(var(--fg-tertiary))]">
                      Current: {allocationPercentage}%
                    </span>
                    <button
                      onClick={() => startEditing(index)}
                      className="text-xs text-[rgb(var(--accent-primary))] hover:text-[rgb(var(--accent-secondary))] transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="mb-3 space-y-2">
        {/* Add Asset Section */}
        <div className="p-2 bg-[rgb(var(--bg-tertiary))] rounded-lg border border-[rgb(var(--border-primary))]">
          <div className="flex items-center gap-3">
            <select
              value=""
              onChange={(e) => {
                const selectedId = e.target.value as AssetId;
                if (selectedId) {
                  setAllocations([...allocations, { id: selectedId, allocation: 0 }]);
                  e.target.value = "";
                }
              }}
              className="input flex-1"
            >
              <option value="">Select an asset to add...</option>
              {availableAssets
                .filter(assetId => !allocations.some(existing => existing.id === assetId))
                .map((id) => (
                  <option key={id} value={id}>
                    {ASSET_ID_TO_SYMBOL[id]} - ${spot[id]?.toFixed(4) || "0.0000"}
                  </option>
                ))}
            </select>
            <button
              onClick={addAsset}
              className="icon-btn"
              title="Add Asset"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>

        {/* Loading States and Error Messages */}
        {(loadingPrices || loadingLogos) && (
          <div className="p-2 bg-blue-900/20 border border-blue-700 rounded-lg">
            <div className="flex items-center gap-2 text-blue-300 text-sm">
              <IconLoader2 size={16} className="animate-spin" />
              {loadingPrices && "Fetching current prices..."}
              {loadingLogos && "Loading asset images..."}
            </div>
          </div>
        )}

        {(priceError || logoError) && (
          <div className="p-2 bg-red-900/20 border border-red-700 rounded-lg">
            <div className="text-red-300 text-sm">
              {priceError && <div>Price Error: {priceError}</div>}
              {logoError && <div>Logo Error: {logoError}</div>}
            </div>
          </div>
        )}

        {/* Refresh Data Button */}
        {allocations.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                const assetIds = allocations.map(a => a.id);
                fetchCurrentPrices(assetIds);
                fetchTokenLogos(assetIds);
              }}
              disabled={loadingPrices || loadingLogos}
              className="btn btn-secondary btn-sm flex items-center gap-2"
            >
              <IconRefresh size={16} className={loadingPrices || loadingLogos ? "animate-spin" : ""} />
              Refresh Data
            </button>
          </div>
        )}
      </div>

      {/* Portfolio Summary */}
      <div className="mt-3 pt-3 border-t border-[rgb(var(--border-primary))]">
        <div className="grid grid-cols-2 gap-3 text-sm mb-2">
          <div>
            <div className="text-[rgb(var(--fg-secondary))]">Total Allocation</div>
            <div className={`font-semibold ${Math.abs(allocationSum - 1) > 1e-4 ? 'text-red-400' : 'text-green-400'}`}>
              {(allocationSum * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[rgb(var(--fg-secondary))]">Assets</div>
            <div className="font-semibold text-[rgb(var(--fg-primary))]">
              {allocations.length}
            </div>
          </div>
        </div>

        <div className="mb-2">
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-1">
            Initial Capital (USDC) <span className="text-xs text-[rgb(var(--fg-tertiary))]">• Editable</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value > 0) {
                  setInitialCapital(value);
                } else if (e.target.value === '') {
                  setInitialCapital(0);
                }
              }}
              onBlur={(e) => {
                const value = parseFloat(e.target.value);
                if (isNaN(value) || value <= 0) {
                  setInitialCapital(100);
                }
              }}
              min={1}
              step={0.01}
              className="input w-full pr-8 text-base font-semibold"
              placeholder="Enter initial capital"
              style={{ backgroundColor: 'rgb(var(--bg-secondary))', border: '2px solid rgb(var(--border-primary))' }}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-[rgb(var(--fg-tertiary))]">
              $
            </div>
          </div>
          <div className="text-xs text-[rgb(var(--fg-tertiary))] mt-0.5">
            Starting amount for your portfolio backtest
          </div>
        </div>

        {Math.abs(allocationSum - 1) > 1e-4 && (
          <div className="mb-2 p-2 bg-red-900/20 border border-red-700 rounded-lg">
            <div className="text-xs text-red-300">
              ⚠️ Portfolio allocation is not 100%. Current allocation: {(allocationSum * 100).toFixed(1)}%
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setAllocations([{ id: "usd-coin", allocation: 0.8 }, { id: "bitcoin", allocation: 0.2 }])}
            className="btn btn-secondary flex-1"
          >
            Reset to Default
          </button>
          <button
            onClick={normalizeAllocations}
            className="btn btn-secondary flex-1"
            disabled={Math.abs(allocationSum - 1) < 1e-4}
          >
            Normalize
          </button>
          <button
            onClick={onSave}
            className="btn btn-primary flex-1"
            disabled={Math.abs(allocationSum - 1) > 1e-4}
          >
            <IconDeviceFloppy size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
