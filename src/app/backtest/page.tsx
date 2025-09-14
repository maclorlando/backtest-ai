"use client";
import React, { useMemo, useState, useEffect } from "react";
import { format, subYears, differenceInCalendarDays } from "date-fns";
import Image from "next/image";
import { ASSET_ID_TO_SYMBOL, type AssetId, type BacktestRequest, type BacktestResponse } from "@/lib/types";
import { fetchCoinLogos, fetchCurrentPricesUSD } from "@/lib/prices";
import { IconChartLine, IconTrendingUp, IconShield } from "@tabler/icons-react";
import { showSuccessNotification, showWarningNotification, showErrorNotification } from "@/lib/utils/errorHandling";
import PortfolioChart from "@/components/charts/PortfolioChart";
import ComparisonChart from "@/components/charts/ComparisonChart";
import PortfolioBuilder from "@/components/widgets/PortfolioBuilder";
import DateRangeWidget from "@/components/widgets/DateRangeWidget";
import RebalancingWidget from "@/components/widgets/RebalancingWidget";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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

  // Load logos on mount and when assets change
  useEffect(() => {
    const ids = Array.from(new Set(allocations.map((a) => a.id)));
    const key = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
    fetchCoinLogos(ids, key).then(setLogos).catch(() => {});
  }, [allocations]);

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

  // Also fetch logos for the full supported asset list once so options render with icons
  useEffect(() => {
    const allIds: AssetId[] = [
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
    ];
    const key = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
    fetchCoinLogos(allIds, key).then((res) => setLogos((prev) => ({ ...res, ...prev }))).catch(() => {});
    fetchCurrentPricesUSD(allIds, key).then(setSpot).catch(() => {});
  }, []);

  // Initialize dates on client to avoid SSR hydration mismatch due to timezones
  useEffect(() => {
    if (!start || !end) {
      const now = new Date();
      setEnd(format(now, "yyyy-MM-dd"));
      setStart(format(subYears(now, 5), "yyyy-MM-dd"));
    }
  }, []);

  async function saveCurrentPortfolio() {
    // If we already have a result, reuse it; otherwise call API
    let res = result;
    if (!res) {
      const cgKey = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
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
    try {
      const cgKey = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
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
      
      
      // Auto-scroll to results section
      setTimeout(() => {
        const resultsSection = document.querySelector('.chart-container');
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      
      if (Array.isArray(data?.integrity?.issues) && data.integrity.issues.length > 0) {
        showWarningNotification("Backtest Completed with Warnings", `${data.integrity.issues.length} data quality issue(s) detected`);
        showWarningNotification("Backtest Completed with Warnings", `${data.integrity.issues.length} data quality issue(s) detected`);
      } else {
        showSuccessNotification("Backtest Completed", "Analysis completed successfully");
        showSuccessNotification("Backtest Completed", "Analysis completed successfully");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function compareAll() {
    try {
      setComparing(true);
      const entries = Object.entries(saved);
      if (entries.length === 0) return;
      // Normalize to a common timeline using API responses
      const responses: { name: string; res: BacktestResponse & { series: { portfolio: { date: string; value: number }[] } ; metrics: { cagrPct: number; volatilityPct: number; maxDrawdownPct: number }; risk?: { riskReward?: number | null } } }[] = [];
      for (const [name, cfg] of entries) {
        const body: BacktestRequest = {
          assets: cfg.allocations,
          startDate: cfg.start,
          endDate: cfg.end,
          rebalance: { mode: cfg.mode, periodDays: cfg.periodDays, thresholdPct: cfg.thresholdPct },
          initialCapital: cfg.initialCapital,
        };
        const cgKey = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
        const r = await fetch("/api/backtest", { method: "POST", headers: { "Content-Type": "application/json", ...(cgKey ? { "x-cg-key": cgKey } : {}) }, body: JSON.stringify(body) });
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
              showErrorNotification("Comparison Error", msg);
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
        <h1 className="hero-title">DeBank - Portfolio Backtesting</h1>
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
      </section>

      {/* Main Widgets */}
      <section className="widget-grid">
        <PortfolioBuilder
          allocations={allocations}
          setAllocations={setAllocations}
          spot={spot}
          logos={logos}
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
            
            <button 
              onClick={run} 
              disabled={Math.abs(allocationSum - 1) > 1e-4 || loading}
              className="btn btn-primary btn-lg w-full"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Running Backtest...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <IconChartLine size={20} />
                  Run Backtest
                </div>
              )}
            </button>
            
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
    </div>
  );
}