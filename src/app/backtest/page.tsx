"use client";
import React, { useMemo, useState, useEffect } from "react";
import { format, subYears, differenceInCalendarDays } from "date-fns";
import Image from "next/image";
import { ASSET_ID_TO_SYMBOL, type AssetId, type BacktestRequest, type BacktestResponse } from "@/lib/types";
import { fetchCoinLogos, fetchCurrentPricesUSD, checkPriceDataAvailability, fetchPricesForBacktest, resetRateLimitState } from "@/lib/prices";
import { dataService } from "@/lib/dataService";
import { IconChartLine, IconTrendingUp, IconShield } from "@tabler/icons-react";
import { showSuccessNotification, showWarningNotification, showErrorNotification } from "@/lib/utils/errorHandling";
import { getCoinGeckoApiKey } from "@/lib/utils/apiKey";
import PortfolioChart from "@/components/charts/PortfolioChart";
import ComparisonChart from "@/components/charts/ComparisonChart";
import LoadingOverlay from "@/components/LoadingOverlay";
import PortfolioBuilder from "@/components/widgets/PortfolioBuilder";
import DateRangeWidget from "@/components/widgets/DateRangeWidget";
import RebalancingWidget from "@/components/widgets/RebalancingWidget";
import DCAWidget from "@/components/widgets/DCAWidget";
import SavedPortfoliosWidget from "@/components/widgets/SavedPortfoliosWidget";

type AllocationRow = { id: AssetId; allocation: number };

export default function BacktestPage() {
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    { id: "usd-coin", allocation: 0.8 },
    { id: "bitcoin", allocation: 0.2 },
  ]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"none" | "periodic" | "threshold">("none");
  const [periodDays, setPeriodDays] = useState(30);
  const [thresholdPct, setThresholdPct] = useState(5);
  const [dcaEnabled, setDcaEnabled] = useState(false);
  const [dcaCapital, setDcaCapital] = useState(100);
  const [dcaPeriodicity, setDcaPeriodicity] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceDataAvailable, setPriceDataAvailable] = useState<boolean | null>(null);
  const [priceDataError, setPriceDataError] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState<string | null>(null);
  
  type BacktestUIResult = {
    series: {
      portfolio: { date: string; value: number }[];
      perAssetPrices?: Record<string, number[]>;
      perAssetWeights?: Record<string, number[]>;
    };
    metrics: {
      startDate: string;
      endDate: string;
      tradingDays: number;
      initialCapital: number;
      finalValue: number;
      cumulativeReturnPct: number;
      cagrPct: number;
      volatilityPct: number;
      maxDrawdownPct: number;
      sharpe: number | null;
      // DCA-specific metrics
      totalInvested?: number;
      dcaContributions?: number;
      capitalGrowth?: number;
      capitalGrowthPct?: number;
    };
    risk?: { perAssetVolatilityPct: Record<string, number>; riskReward: number | null };
    integrity?: { score: number; issues: string[] };
  };
  
  const [result, setResult] = useState<BacktestUIResult | null>(null);
  const [initialCapital, setInitialCapital] = useState<number>(100);
  
  type SavedRecord = {
    allocations: AllocationRow[];
    start: string; end: string; mode: typeof mode;
    periodDays?: number; thresholdPct?: number; initialCapital: number;
    dcaEnabled?: boolean; dcaCapital?: number; dcaPeriodicity?: typeof dcaPeriodicity;
    kpis?: {
      finalValue: number;
      retPct: number;
      cagrPct: number;
      volPct: number;
      maxDdPct: number;
      rr: number | null;
    };
  };
  
  const [saved, setSaved] = useState<Record<string, SavedRecord>>({});
  const [mounted, setMounted] = useState(false);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [spot, setSpot] = useState<Record<string, number>>({});
  const [comparing, setComparing] = useState(false);
  const [comparisonData, setComparisonData] = useState<Array<Record<string, number | string>>>([]);
  const [comparisonLines, setComparisonLines] = useState<
    { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } }[]
  >([]);
  const [cacheStats, setCacheStats] = useState<{ valid: number; expired: number; total: number } | null>(null);

  // Load logos using centralized data service
  const loadLogosForAssets = async (assetIds: AssetId[]) => {
    try {
      const logos = await dataService.getTokenLogos(assetIds);
      setLogos(prev => ({ ...prev, ...logos }));
    } catch (error) {
      console.warn('Failed to load logos:', error);
    }
  };


  // Check price data availability only when backtest is requested
  const checkPriceDataAvailabilityForBacktest = async () => {
    const ids = Array.from(new Set(allocations.map((a) => a.id)));
    if (ids.length === 0) {
      setPriceDataAvailable(false);
      setPriceDataError("No assets selected");
      return false;
    }
    
    if (!start || !end) {
      setPriceDataAvailable(false);
      setPriceDataError("Date range not set");
      return false;
    }
    
    const key = getCoinGeckoApiKey();
    try {
      const result = await checkPriceDataAvailability(ids, key, start, end);
      setPriceDataAvailable(result.available);
      setPriceDataError(result.error || null);
      return result.available;
    } catch (error) {
      setPriceDataAvailable(false);
      setPriceDataError(error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  // Hydration-safe load of saved portfolios from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("bt_portfolios") : null;
      const parsed = raw ? (JSON.parse(raw) as Record<string, SavedRecord>) : {};
      setSaved(parsed);
    } catch {
      // ignore
    }
  }, []);

  // Preload common assets data on page load
  useEffect(() => {
    if (mounted) {
      console.log('Preloading common assets data...');
      dataService.preloadCommonAssets().then(() => {
        // Load the preloaded data into component state
        const commonAssets: AssetId[] = [
          'bitcoin', 'ethereum', 'usd-coin', 'tether', 'solana',
          'pepe', 'polkadot', 'aave', 'chainlink', 'fartcoin',
          'wrapped-staked-ether', 'euro-coin'
        ];
        loadCurrentPrices(commonAssets);
        loadLogosForAssets(commonAssets);
      }).catch(error => {
        console.warn('Failed to preload common assets:', error);
      });
      
      // Update cache stats
      setCacheStats(dataService.getCacheStats());
    }
  }, [mounted]);

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheStats(dataService.getCacheStats());
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Load current prices using centralized data service
  const loadCurrentPrices = async (assetIds: AssetId[]) => {
    try {
      console.log('Backtest page: Loading current prices for:', assetIds);
      const prices = await dataService.getCurrentPrices(assetIds);
      console.log('Backtest page: Received prices:', prices);
      setSpot(prev => {
        const updated = { ...prev, ...prices };
        console.log('Backtest page: Updated spot state:', updated);
        return updated;
      });
    } catch (error) {
      console.warn('Failed to load current prices:', error);
    }
  };

  // Initialize dates on client to avoid SSR hydration mismatch due to timezones
  useEffect(() => {
    if (!start || !end) {
      const now = new Date();
      setEnd(format(now, "yyyy-MM-dd"));
      // Default to 3 years for better statistical significance with Alchemy API
      setStart(format(subYears(now, 3), "yyyy-MM-dd"));
    }
  }, []);


  async function saveCurrentPortfolio() {
    // If we already have a result, reuse it; otherwise call API
    let res = result;
    if (!res) {
      const cgKey = getCoinGeckoApiKey();
      const r = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cgKey ? { "x-cg-key": cgKey } : {}) },
        body: JSON.stringify({
          assets: allocations,
          startDate: start,
          endDate: end,
          rebalance: {
            mode,
            periodDays: mode === "periodic" ? periodDays : undefined,
            thresholdPct: mode === "threshold" ? thresholdPct : undefined,
          },
          initialCapital,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Request failed");
      res = data;
    }
    type MetricsShape = { finalValue: number; cumulativeReturnPct: number; cagrPct: number; volatilityPct?: number; maxDrawdownPct: number };
    type RiskShape = { risk?: { riskReward?: number | null } };
    const m = (res as unknown as { metrics: MetricsShape } & RiskShape).metrics;
    const rr = (res as unknown as RiskShape).risk?.riskReward ?? null;
    const kpis: NonNullable<SavedRecord["kpis"]> = {
      finalValue: m.finalValue,
      retPct: m.cumulativeReturnPct,
      cagrPct: m.cagrPct,
      volPct: m.volatilityPct ?? 0,
      maxDdPct: m.maxDrawdownPct,
      rr,
    };
    const name = prompt("Save portfolio as:")?.trim();
    if (!name) return;
    const record: SavedRecord = {
      allocations: [...allocations],
      start, end, mode, periodDays, thresholdPct, initialCapital,
      dcaEnabled, dcaCapital, dcaPeriodicity,
      kpis,
    };
    const next = { ...saved, [name]: record };
    setSaved(next);
    localStorage.setItem("bt_portfolios", JSON.stringify(next));
    showSuccessNotification("Portfolio Saved", `Saved portfolio '${name}'`);
    showSuccessNotification("Portfolio Saved", `Saved portfolio '${name}'`);
  }

  const allocationSum = allocations.reduce((s, a) => s + a.allocation, 0);

  async function run() {
    setError(null);
    setLoading(true);
    setFetchingPrices(true);
    setFetchProgress(0);
    setCurrentAsset(null);
    
    try {
      const cgKey = getCoinGeckoApiKey();
      const assetIds = Array.from(new Set(allocations.map((a) => a.id)));
      
      // Load logos and current prices in parallel with historical data fetching
      console.log(`Starting backtest for assets: ${assetIds.join(', ')}`);
      console.log(`Portfolio allocations:`, allocations);
      
      // Fetch historical prices with progress tracking
      const prices = await fetchPricesForBacktest(assetIds, start, end, cgKey, (assetId, progress) => {
        setCurrentAsset(assetId);
        setFetchProgress(progress);
      });
      
      // Load logos and current prices in background (non-blocking) - these are now cached
      loadLogosForAssets(assetIds).catch(() => {});
      loadCurrentPrices(assetIds).catch(() => {});
      
      setFetchingPrices(false);
      setFetchProgress(100);
      
      // Now run the backtest with the fetched prices
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cgKey ? { "x-cg-key": cgKey } : {}) },
        body: JSON.stringify({
          assets: allocations,
          startDate: start,
          endDate: end,
          rebalance: {
            mode,
            periodDays: mode === "periodic" ? periodDays : undefined,
            thresholdPct: mode === "threshold" ? thresholdPct : undefined,
          },
          initialCapital,
          dca: dcaEnabled ? {
            enabled: dcaEnabled,
            amount: dcaCapital,
            periodicity: dcaPeriodicity,
          } : undefined,
          prices, // Pass the fetched prices directly
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResult(data);
      
      // Auto-scroll to results section
      setTimeout(() => {
        const resultsSection = document.querySelector('.chart-container');
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      
      if (Array.isArray(data?.integrity?.issues) && data.integrity.issues.length > 0) {
        showWarningNotification("Backtest Completed with Warnings", `${data.integrity.issues.length} data quality issue(s) detected`);
      } else {
        showSuccessNotification("Backtest Completed", "Analysis completed successfully");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
      setFetchingPrices(false);
      setFetchProgress(0);
      setCurrentAsset(null);
    }
  }

  async function compareAll() {
    try {
      setComparing(true);
      const entries = Object.entries(saved);
      if (entries.length === 0) return;
      
      // Show success notification for starting comparison
      showSuccessNotification(
        `Starting comparison of ${entries.length} portfolios...`,
        "Portfolio Comparison"
      );
      
      // Normalize to a common timeline using API responses
      const responses: { name: string; res: BacktestResponse & { series: { portfolio: { date: string; value: number }[] } ; metrics: { cagrPct: number; volatilityPct: number; maxDrawdownPct: number }; risk?: { riskReward?: number | null } } }[] = [];
      
      // Get all unique assets across all portfolios
      const allAssets = Array.from(new Set(entries.flatMap(([_, cfg]) => cfg.allocations.map(a => a.id))));
      
      // Get common date range (use the earliest start and latest end)
      const allStarts = entries.map(([_, cfg]) => new Date(cfg.start));
      const allEnds = entries.map(([_, cfg]) => new Date(cfg.end));
      const commonStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
      const commonEnd = new Date(Math.max(...allEnds.map(d => d.getTime())));
      const commonStartStr = commonStart.toISOString().split('T')[0];
      const commonEndStr = commonEnd.toISOString().split('T')[0];
      
      console.log(`Comparing ${entries.length} portfolios with common date range: ${commonStartStr} to ${commonEndStr}`);
      
      // Fetch price data once for all assets
      const cgKey = getCoinGeckoApiKey();
      const prices = await fetchPricesForBacktest(allAssets, commonStartStr, commonEndStr, cgKey);
      
      for (const [name, cfg] of entries) {
        const body: BacktestRequest = {
          assets: cfg.allocations,
          startDate: cfg.start,
          endDate: cfg.end,
          rebalance: { mode: cfg.mode, periodDays: cfg.periodDays, thresholdPct: cfg.thresholdPct },
          initialCapital: cfg.initialCapital,
          dca: cfg.dcaEnabled ? {
            enabled: cfg.dcaEnabled,
            amount: cfg.dcaCapital ?? 0,
            periodicity: cfg.dcaPeriodicity ?? "monthly",
          } : undefined,
          prices, // Include the fetched prices
        };
        
        const r = await fetch("/api/backtest", { 
          method: "POST", 
          headers: { "Content-Type": "application/json", ...(cgKey ? { "x-cg-key": cgKey } : {}) }, 
          body: JSON.stringify(body) 
        });
        
        const data = (await r.json()) as (BacktestResponse & { series: { portfolio: { date: string; value: number }[] } ; metrics: { cagrPct: number; volatilityPct: number; maxDrawdownPct: number }; risk?: { riskReward?: number | null } }) | { error?: string };
        if (!r.ok) throw new Error((data as { error?: string })?.error || "Request failed");
        responses.push({ name, res: data as BacktestResponse & { series: { portfolio: { date: string; value: number }[] } ; metrics: { cagrPct: number; volatilityPct: number; maxDrawdownPct: number }; risk?: { riskReward?: number | null } } });
      }
      const allDates = Array.from(new Set(responses.flatMap((x) => x.res.series.portfolio.map((p) => p.date)))).sort();
      const colorPool = ["#1e90ff", "#22c55e", "#ef4444", "#a855f7", "#f59e0b", "#06b6d4", "#e11d48", "#84cc16"]; // rotate if needed
      const lines: { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } }[] = [];
      const seriesByName: Record<string, Record<string, number>> = {};
      responses.forEach((r, idx) => {
        const key = `p_${idx}`;
        const color = colorPool[idx % colorPool.length];
        lines.push({
          key,
          name: r.name,
          color,
          kpis: {
            cagrPct: r.res.metrics.cagrPct,
            volPct: r.res.metrics.volatilityPct,
            maxDdPct: r.res.metrics.maxDrawdownPct,
            rr: r.res.risk?.riskReward ?? null,
          },
        });
        const map: Record<string, number> = {};
        r.res.series.portfolio.forEach((p) => (map[p.date] = p.value));
        seriesByName[key] = map;
      });
      const rows = allDates.map((d) => {
        const row: Record<string, number | string> = { date: d };
        for (const ln of lines) {
          const v = seriesByName[ln.key][d];
          row[ln.key] = typeof v === "number" ? v : NaN;
        }
        return row;
      });
      setComparisonLines(lines);
      setComparisonData(rows);
      
      // Show success notification when comparison completes
      showSuccessNotification(
        `Successfully compared ${lines.length} portfolios`,
        "Comparison Complete"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      showErrorNotification("Comparison Error", msg);
    } finally {
      setComparing(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result) return [] as Array<Record<string, number | string>>;
    const timeline = result.series.portfolio.map((p) => p.date);
    const perAssetPrices = result.series.perAssetPrices || {};
    const perAssetWeights = result.series.perAssetWeights || {};
    return result.series.portfolio.map((p, i) => {
      const row: Record<string, number | string> = {
        date: p.date,
        value: p.value,
        invested: initialCapital,
      };
      allocations.forEach((a) => {
        const price = perAssetPrices[a.id]?.[i];
        const weight = perAssetWeights[a.id]?.[i];
        if (price != null) row[`${a.id}_price`] = price;
        if (weight != null) row[`${a.id}_weight`] = weight * 100;
      });
      return row;
    });
  }, [result, initialCapital, allocations]);




  const handleLoadPortfolio = (cfg: SavedRecord) => {
    setAllocations([...cfg.allocations]);
    setStart(cfg.start);
    setEnd(cfg.end);
    setMode(cfg.mode);
    setPeriodDays(cfg.periodDays ?? 30);
    setThresholdPct(cfg.thresholdPct ?? 5);
    setInitialCapital(cfg.initialCapital ?? 100);
    setDcaEnabled(cfg.dcaEnabled ?? false);
    setDcaCapital(cfg.dcaCapital ?? 100);
    setDcaPeriodicity(cfg.dcaPeriodicity ?? "monthly");
    showSuccessNotification("Portfolio Loaded", `Loaded portfolio configuration`);
  };

  const handleLoadPortfolioAllocations = (allocations: AllocationRow[]) => {
    setAllocations([...allocations]);
    showSuccessNotification("Portfolio Loaded", `Loaded portfolio allocations`);
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="hero">
        <h1 className="hero-title">SagaFi - Portfolio Backtesting</h1>
        <p className="hero-subtitle">
          Test your crypto investment strategies with historical data. Analyze performance, 
          optimize allocations, and make data-driven decisions for Aave Base markets.
        </p>
      </section>

      {/* Stats Cards */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{allocations.length}</div>
          <div className="stat-label">Assets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{(allocationSum * 100).toFixed(1)}%</div>
          <div className="stat-label">Allocated</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${initialCapital}</div>
          <div className="stat-label">Initial Capital</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(saved).length}</div>
          <div className="stat-label">Saved Portfolios</div>
        </div>
        {cacheStats && (
          <div className="stat-card">
            <div className="stat-value">{cacheStats.valid}</div>
            <div className="stat-label">Cached Items</div>
          </div>
        )}
      </section>

      {/* Main Widgets */}
      <section className="widget-grid">
        <PortfolioBuilder
          allocations={allocations}
          setAllocations={setAllocations}
          spot={spot}
          setSpot={setSpot}
          logos={logos}
          setLogos={setLogos}
          initialCapital={initialCapital}
          setInitialCapital={setInitialCapital}
          onSave={saveCurrentPortfolio}
          allocationSum={allocationSum}
          onLoadPortfolio={handleLoadPortfolioAllocations}
        />

        <SavedPortfoliosWidget
          saved={saved}
          setSaved={setSaved}
          onLoadPortfolio={handleLoadPortfolio}
          onCompareAll={compareAll}
          mounted={mounted}
          logos={logos}
          comparing={comparing}
        />

        <DateRangeWidget
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
        />

        <RebalancingWidget
          mode={mode}
          setMode={setMode}
          periodDays={periodDays}
          setPeriodDays={setPeriodDays}
          thresholdPct={thresholdPct}
          setThresholdPct={setThresholdPct}
          loading={loading}
          error={error}
          allocationSum={allocationSum}
        />

        <DCAWidget
          enabled={dcaEnabled}
          setEnabled={setDcaEnabled}
          capital={dcaCapital}
          setCapital={setDcaCapital}
          periodicity={dcaPeriodicity}
          setPeriodicity={setDcaPeriodicity}
          loading={loading}
          error={error}
        />
      </section>

      {/* Standalone Run Button */}
      <section className="flex justify-center">
        <div className="card max-w-md w-full">
          <div className="text-center space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-2">Ready to Backtest?</h3>
              <p className="text-sm text-[rgb(var(--fg-secondary))]">
                Configure your portfolio, date range, and rebalancing strategy above
              </p>
            </div>
            
            <div className="relative group">
              <button 
                onClick={run} 
                disabled={Math.abs(allocationSum - 1) > 1e-4 || loading || fetchingPrices}
                className="btn btn-primary btn-lg w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading || fetchingPrices ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {fetchingPrices ? 'Fetching Prices...' : 'Running Backtest...'}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <IconChartLine size={20} />
                    Run Backtest
                  </div>
                )}
              </button>
              
            </div>
            
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}
            
            {Math.abs(allocationSum - 1) > 1e-4 && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg text-yellow-300 text-sm">
                ⚠️ Portfolio allocation is not 100%. Current allocation: {(allocationSum * 100).toFixed(1)}%
              </div>
            )}
            
            {/* Price data availability will be checked when backtest is requested */}
            
            {fetchingPrices && (
              <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg text-blue-300 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"></div>
                  Fetching historical prices... {Math.round(fetchProgress)}%
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${fetchProgress}%` }}
                  ></div>
                </div>
                {currentAsset && (
                  <div className="text-center text-xs text-gray-400">
                    Fetching data for {ASSET_ID_TO_SYMBOL[currentAsset as AssetId] || currentAsset}...
                  </div>
                )}
                <div className="text-center text-xs text-gray-500 mt-2">
                  ⚡ Chunked data fetching (365-day segments)
                  <br />
                  ⏱️ Sequential processing for optimal API usage
                  <br />
                  📅 Extensive historical data coverage available
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Loading State */}
      {loading && (
        <section className="space-y-6">
          <div className="stats-grid">
            <div className="stat-card skeleton h-20" />
            <div className="stat-card skeleton h-20" />
            <div className="stat-card skeleton h-20" />
            <div className="stat-card skeleton h-20" />
          </div>
          <div className="chart-container">
            <div className="skeleton h-96 w-full" />
          </div>
        </section>
      )}

      {/* Results */}
      {result && (
        <section className="space-y-6">
          {/* Metrics Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">${result.metrics.finalValue.toFixed(2)}</div>
              <div className="stat-label">Final Value</div>
            </div>
            <div className="stat-card">
              <div className={`stat-value ${result.metrics.cumulativeReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {result.metrics.cumulativeReturnPct >= 0 ? "+" : ""}{result.metrics.cumulativeReturnPct.toFixed(2)}%
              </div>
              <div className="stat-label">Cumulative Return</div>
            </div>
            <div className="stat-card">
              <div className={`stat-value ${result.metrics.cagrPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {result.metrics.cagrPct >= 0 ? "+" : ""}{result.metrics.cagrPct.toFixed(2)}%
              </div>
              <div className="stat-label">CAGR</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">${result.metrics.initialCapital.toFixed(2)}</div>
              <div className="stat-label">Initial Capital</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-red-400">{result.metrics.maxDrawdownPct.toFixed(2)}%</div>
              <div className="stat-label">Max Drawdown</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.metrics.sharpe == null ? "—" : result.metrics.sharpe.toFixed(2)}</div>
              <div className="stat-label">Sharpe Ratio</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.risk?.riskReward == null ? "—" : result.risk.riskReward.toFixed(2)}</div>
              <div className="stat-label">Risk/Reward</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.metrics.volatilityPct.toFixed(2)}%</div>
              <div className="stat-label">Volatility</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-xs font-normal leading-tight">
                <div className="flex flex-wrap gap-2 items-center">
                  {allocations.map((a, index) => (
                    <div key={a.id} className="flex items-center gap-1">
                      {logos[a.id] && (
                        <Image
                          src={logos[a.id]}
                          alt={ASSET_ID_TO_SYMBOL[a.id]}
                          width={16}
                          height={16}
                          className="rounded-full"
                        />
                      )}
                      <span className="text-xs">
                        {ASSET_ID_TO_SYMBOL[a.id]} {(a.allocation * 100).toFixed(1)}%
                      </span>
                      {index < allocations.length - 1 && <span className="text-gray-400">•</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="stat-label">Composition</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-sm font-normal">
                {mode === "none" && "None"}
                {mode === "periodic" && `Every ${periodDays} day${periodDays === 1 ? '' : 's'}`}
                {mode === "threshold" && `Deviation ±${thresholdPct}%`}
              </div>
              <div className="stat-label">Rebalancing</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(differenceInCalendarDays(new Date(result.metrics.endDate), new Date(result.metrics.startDate)) / 365).toFixed(1)}y</div>
              <div className="stat-label">{result.metrics.startDate} → {result.metrics.endDate}</div>
            </div>
            
            {/* DCA-specific metrics */}
            {result.metrics.totalInvested && (
              <>
                <div className="stat-card">
                  <div className="stat-value">${result.metrics.totalInvested.toFixed(2)}</div>
                  <div className="stat-label">Total Invested</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">${result.metrics.dcaContributions?.toFixed(2) ?? 0}</div>
                  <div className="stat-label">DCA Contributions</div>
                </div>
                <div className="stat-card">
                  <div className={`stat-value ${(result.metrics.capitalGrowth ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${result.metrics.capitalGrowth?.toFixed(2) ?? 0}
                  </div>
                  <div className="stat-label">Capital Growth</div>
                </div>
                <div className="stat-card">
                  <div className={`stat-value ${(result.metrics.capitalGrowthPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(result.metrics.capitalGrowthPct ?? 0) >= 0 ? "+" : ""}{(result.metrics.capitalGrowthPct ?? 0).toFixed(2)}%
                  </div>
                  <div className="stat-label">Growth %</div>
                </div>
              </>
            )}
          </div>

          {/* Portfolio Chart */}
          <div className="chart-container">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">Portfolio Performance</h2>
                <p className="text-[rgb(var(--fg-secondary))]">
                  {allocations.map(a => `${ASSET_ID_TO_SYMBOL[a.id]} ${(a.allocation * 100).toFixed(1)}%`).join(" • ")}
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-[rgb(var(--fg-primary))]">
                  ${result.metrics.finalValue.toFixed(2)}
                </div>
                <div className={`text-sm ${result.metrics.cumulativeReturnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {result.metrics.cumulativeReturnPct >= 0 ? "+" : ""}{result.metrics.cumulativeReturnPct.toFixed(2)}% 
                  ({result.metrics.cagrPct >= 0 ? "+" : ""}{result.metrics.cagrPct.toFixed(2)}% CAGR)
                </div>
              </div>
            </div>
            <PortfolioChart data={chartData} />
          </div>

          {/* Additional Metrics */}
          <div className="widget-grid">
            <div className="card">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Per-Asset Risk (Volatility %)</h3>
              <div className="space-y-2">
                {Object.entries(result.risk?.perAssetVolatilityPct || {}).map(([id, v]) => (
                  <div key={id} className="flex items-center justify-between">
                    <span className="text-[rgb(var(--fg-secondary))]">{ASSET_ID_TO_SYMBOL[id as AssetId]}</span>
                    <span className="font-semibold">{v.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="card">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Data Quality</h3>
              <div className="flex items-center gap-3">
                <div className={`badge ${result.integrity && result.integrity.score >= 90 ? 'badge-success' : result.integrity && result.integrity.score >= 70 ? 'badge-primary' : ''}`}>
                  Score: {result.integrity ? result.integrity.score : 0}/100
                </div>
              </div>
              {result.integrity?.issues && result.integrity.issues.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                  <div className="text-sm font-semibold text-yellow-300 mb-2">Issues detected:</div>
                  <ul className="text-xs text-yellow-200 space-y-1">
                    {result.integrity.issues.slice(0, 3).map((issue, i) => (
                      <li key={i}>• {issue}</li>
                    ))}
                    {result.integrity.issues.length > 3 && (
                      <li>• ... and {result.integrity.issues.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            
            {/* DCA Strategy Breakdown */}
            {result.metrics.totalInvested && (
              <div className="card">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">DCA Strategy Breakdown</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <div className="text-sm font-semibold text-blue-300 mb-2">Investment Summary</div>
                    <div className="text-xs text-blue-200 space-y-1">
                      <div>• Initial Capital: ${result.metrics.initialCapital.toFixed(2)}</div>
                      <div>• DCA Contributions: ${result.metrics.dcaContributions?.toFixed(2) ?? 0}</div>
                      <div>• Total Invested: ${result.metrics.totalInvested.toFixed(2)}</div>
                      <div>• Final Value: ${result.metrics.finalValue.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-green-900/20 border border-green-700 rounded-lg">
                    <div className="text-sm font-semibold text-green-300 mb-2">Growth Analysis</div>
                    <div className="text-xs text-green-200 space-y-1">
                      <div>• Capital Growth: ${result.metrics.capitalGrowth?.toFixed(2) ?? 0}</div>
                      <div>• Growth Percentage: {(result.metrics.capitalGrowthPct ?? 0).toFixed(2)}%</div>
                      <div>• DCA Strategy: {dcaPeriodicity} investments of ${dcaCapital}</div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-400">
                    💡 DCA helps reduce the impact of market volatility by spreading investments over time
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Comparison Chart - always after results section */}
      {comparisonLines.length > 0 && (
        <section className="chart-container">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">Portfolio Comparison</h2>
              <p className="text-[rgb(var(--fg-secondary))]">
                Comparing {comparisonLines.length} saved portfolios
              </p>
            </div>
            <button
              onClick={() => {
                setComparisonLines([]);
                setComparisonData([]);
              }}
              className="btn btn-secondary"
            >
              Close Comparison
            </button>
          </div>
          <ComparisonChart data={comparisonData} lines={comparisonLines} />
        </section>
      )}

      {/* Loading Overlay for Comparison */}
      <LoadingOverlay 
        visible={comparing} 
        message="Comparing portfolios..." 
        zIndex={2000}
      />
    </div>
  );
}