"use client";
import React, { useState, useEffect, useRef } from 'react';
import { IconRefresh, IconTrendingUp, IconWallet, IconBuildingBank, IconDatabase } from '@tabler/icons-react';
import { calculateConsolidatedNAV, calculatePortfolioExposure, type NAVCalculation, type ConsolidatedAsset } from '@/lib/oracle/navCalculator';
import type { AaveUserPosition } from '@/lib/types';

interface PortfolioNAVWidgetProps {
  walletBalances: Array<{ symbol: string; address: string; balance: string; decimals: number }>;
  aavePositions: AaveUserPosition[];
  chainId: number;
  className?: string;
}

export default function PortfolioNAVWidget({ 
  walletBalances, 
  aavePositions, 
  chainId, 
  className = "" 
}: PortfolioNAVWidgetProps) {
  const [navData, setNavData] = useState<NAVCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const refreshNAV = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Convert wallet balances to AssetPosition format
      const walletPositions = walletBalances.map(balance => ({
        address: balance.address,
        symbol: balance.symbol,
        balance: balance.balance,
        decimals: balance.decimals,
        chainId,
        source: 'wallet' as const
      }));

      const nav = await calculateConsolidatedNAV(walletPositions, aavePositions, chainId);
      setNavData(nav);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('Failed to calculate NAV:', err);
      setError(err instanceof Error ? err.message : 'Failed to calculate portfolio value');
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefresh;
    const MIN_REFRESH_INTERVAL = 5000; // 5 seconds minimum between manual refreshes
    
    if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
      console.log(`Please wait ${Math.ceil((MIN_REFRESH_INTERVAL - timeSinceLastRefresh) / 1000)} seconds before refreshing again`);
      return;
    }
    
    refreshNAV();
  };

  // Auto-refresh when data changes (with debouncing)
  useEffect(() => {
    if (walletBalances.length > 0 || aavePositions.length > 0) {
      // Clear any existing timeout
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Debounce the refresh by 1 second to prevent too frequent calls
      refreshTimeoutRef.current = setTimeout(() => {
        refreshNAV();
      }, 1000);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [walletBalances, aavePositions, chainId]);

  const exposure = navData ? calculatePortfolioExposure(navData) : {};

  const getAssetIcon = (symbol: string) => {
    switch (symbol) {
      case 'BTC':
        return '₿';
      case 'ETH':
        return 'Ξ';
      case 'USDC':
        return '$';
      default:
        return symbol.charAt(0);
    }
  };

  const getAssetColor = (symbol: string) => {
    switch (symbol) {
      case 'BTC':
        return 'bg-orange-500';
      case 'ETH':
        return 'bg-blue-500';
      case 'USDC':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (error) {
    return (
      <div className={`card p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Portfolio Value</h3>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="p-2 text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--accent-primary))] transition-colors"
          >
            <IconRefresh size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">⚠️ Error calculating portfolio value</div>
          <div className="text-sm text-[rgb(var(--fg-secondary))]">{error}</div>
          <button
            onClick={handleManualRefresh}
            className="mt-4 btn btn-primary btn-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Portfolio Value</h3>
        <button
          onClick={handleManualRefresh}
          disabled={loading}
          className="p-2 text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--accent-primary))] transition-colors"
        >
          <IconRefresh size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !navData ? (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-[rgb(var(--accent-primary))] border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-[rgb(var(--fg-secondary))]">Calculating portfolio value...</div>
        </div>
      ) : navData ? (
        <>
          {/* Total Portfolio Value */}
          <div className="text-center mb-6">
            <div className="text-2xl sm:text-3xl font-bold text-[rgb(var(--fg-primary))] mb-2">
              ${navData.totalValueUSD.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm text-[rgb(var(--fg-secondary))]">
              <div className="flex items-center gap-1">
                <IconDatabase size={14} />
                <span>
                  {navData.hasOracleData ? 'Live Oracle Data' : 'Fallback Prices'}
                </span>
              </div>
              <span className="hidden sm:inline">•</span>
              <span>
                Updated {new Date(navData.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Asset Exposure */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-[rgb(var(--fg-secondary))] mb-3">Asset Exposure</h4>
            <div className="space-y-3">
              {Object.entries(exposure).map(([symbol, percentage]) => {
                const asset = navData.assets[symbol];
                if (!asset || percentage === 0) return null;
                
                return (
                  <div key={symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className={`w-6 h-6 sm:w-8 sm:h-8 ${getAssetColor(symbol)} rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm`}>
                        {getAssetIcon(symbol)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[rgb(var(--fg-primary))] text-sm">{symbol}</div>
                        <div className="text-xs text-[rgb(var(--fg-secondary))] space-y-1">
                          {asset.walletBalance > 0 && (
                            <div className="flex items-center gap-1">
                              <IconWallet size={10} />
                              <span className="truncate">{asset.walletBalance.toFixed(4)}</span>
                            </div>
                          )}
                          {asset.aaveBalance > 0 && (
                            <div className="flex items-center gap-1">
                              <IconBuildingBank size={10} />
                              <span className="truncate">{asset.aaveBalance.toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right min-w-0">
                      <div className="font-medium text-[rgb(var(--fg-primary))] text-sm">
                        {percentage.toFixed(1)}%
                      </div>
                      <div className="text-xs text-[rgb(var(--fg-secondary))]">
                        ${asset.totalValueUSD.toLocaleString(undefined, { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Portfolio Breakdown */}
          <div className="border-t border-[rgb(var(--border))] pt-4">
            <h4 className="text-sm font-medium text-[rgb(var(--fg-secondary))] mb-3">Portfolio Breakdown</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <IconWallet size={14} className="text-[rgb(var(--fg-secondary))]" />
                <span className="text-[rgb(var(--fg-secondary))]">Wallet:</span>
                <span className="font-medium text-[rgb(var(--fg-primary))]">
                  ${Object.values(navData.assets)
                    .reduce((sum, asset) => sum + (asset.walletBalance * asset.priceUSD), 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconBuildingBank size={14} className="text-[rgb(var(--fg-secondary))]" />
                <span className="text-[rgb(var(--fg-secondary))]">Aave:</span>
                <span className="font-medium text-[rgb(var(--fg-primary))]">
                  ${Object.values(navData.assets)
                    .reduce((sum, asset) => sum + (asset.aaveBalance * asset.priceUSD), 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <IconTrendingUp size={48} className="mx-auto text-[rgb(var(--fg-secondary))] mb-4" />
          <div className="text-[rgb(var(--fg-secondary))] mb-2">No portfolio data available</div>
          <div className="text-sm text-[rgb(var(--fg-secondary))]">
            Connect your wallet and supply assets to Aave to see your portfolio value
          </div>
        </div>
      )}
    </div>
  );
}
