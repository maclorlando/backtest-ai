"use client";
import { useMemo, useState } from "react";
import { format, subYears } from "date-fns";
import { ASSET_ID_TO_SYMBOL, type AssetId } from "@/lib/types";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type AllocationRow = { id: AssetId; allocation: number };

export default function Home() {
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    { id: "usd-coin", allocation: 0.8 },
    { id: "bitcoin", allocation: 0.2 },
  ]);
  const [start, setStart] = useState(format(subYears(new Date(), 5), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [mode, setMode] = useState<"none" | "periodic" | "threshold">("none");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
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
      finalValue: number;
      cumulativeReturnPct: number;
      cagrPct: number;
      maxDrawdownPct: number;
      sharpe: number | null;
    };
    integrity?: { score: number; issues: string[] };
  };
  const [result, setResult] = useState<BacktestUIResult | null>(null);
  const [initialCapital, setInitialCapital] = useState<number>(100);
  type SavedRecord = {
    allocations: AllocationRow[];
    start: string; end: string; mode: typeof mode;
    periodDays?: number; thresholdPct?: number; initialCapital: number;
  };
  const [saved, setSaved] = useState<Record<string, SavedRecord>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = sessionStorage.getItem("bt_portfolios");
      return raw ? (JSON.parse(raw) as Record<string, SavedRecord>) : {};
    } catch {
      return {};
    }
  });
  const [toast, setToast] = useState<string | null>(null);

  const allocationSum = allocations.reduce((s, a) => s + a.allocation, 0);

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setToast("Backtest completed successfully");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
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

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="header rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Backtest AI — Crypto Portfolio Backtester</h1>
        <div className="flex items-center gap-3">
          <button
            className="header-toggle text-xs"
            onClick={() => {
              setTheme((t) => {
                const next = t === "dark" ? "light" : "dark";
                if (next === "light") document.documentElement.classList.remove("dark");
                else document.documentElement.classList.add("dark");
                sessionStorage.setItem("bt_theme", next);
                return next;
              });
            }}
          >
            <span>{theme === "dark" ? "🌙" : "☀️"}</span>
            <span>{theme === "dark" ? "Dark" : "Light"}</span>
          </button>
          <div className="text-xs sm:text-sm text-slate-500">
          Price data by <a className="underline hover:opacity-80" href="https://www.coingecko.com" target="_blank" rel="noreferrer">CoinGecko</a>
          </div>
          {Object.keys(saved).length > 0 && (
            <div className="hidden sm:block">
              <div className="saved-grid">
                {Object.entries(saved).slice(0, 3).map(([name, cfg]) => (
                  <div key={name} className="card saved-card hover-panel p-2">
                    <div className="text-xs font-semibold">{name}</div>
                    <div className="text-[10px] text-slate-500">
                      {cfg.allocations.map((a) => `${a.id}:${Math.round(a.allocation*100)}%`).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 top-4 z-50 tooltip-card">
          <div className="flex items-center gap-3">
            <div className="chip">Info</div>
            <div>{toast}</div>
            <button className="icon-btn" onClick={() => setToast(null)} aria-label="Close">×</button>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-3 card">
          <h2 className="font-semibold">Assets & Allocations</h2>
          {allocations.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                className="border rounded p-2 flex-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                value={row.id}
                onChange={(e) => {
                  const copy = [...allocations];
                  copy[idx] = { ...row, id: e.target.value as AssetId };
                  setAllocations(copy);
                }}
              >
                {(["usd-coin", "bitcoin", "ethereum", "solana", "tether"] as AssetId[]).map(
                  (id) => (
                    <option key={id} value={id}>
                      {ASSET_ID_TO_SYMBOL[id]} ({id})
                    </option>
                  )
                )}
              </select>
              <input
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={Number.isFinite(row.allocation) ? Number(parseFloat(String(row.allocation)).toFixed(4)) : 0}
                onChange={(e) => {
                  const raw = e.target.value;
                  const next = Number(raw);
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
                className="w-24 border rounded p-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                aria-label="Remove asset"
                className="icon-btn"
                onClick={() => setAllocations((arr) => arr.filter((_, i) => i !== idx))}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="icon-btn"
            title="Add asset"
            onClick={() => setAllocations((a) => [...a, { id: "bitcoin", allocation: 0 }])}
          >
            +
          </button>
          <div className="text-sm text-gray-600">Sum: {(Math.round(allocationSum * 10000) / 10000).toFixed(2)}</div>
          <div className="flex items-center gap-2 pt-2">
            <button
              className="icon-btn"
              onClick={() => {
                const name = prompt("Save portfolio as:")?.trim();
                if (!name) return;
                const record = {
                  allocations,
                  start,
                  end,
                  mode,
                  periodDays,
                  thresholdPct,
                  initialCapital,
                };
                const next = { ...saved, [name]: record };
                setSaved(next);
                sessionStorage.setItem("bt_portfolios", JSON.stringify(next));
                setToast(`Saved portfolio '${name}'`);
                setTimeout(() => setToast(null), 2500);
              }}
            >
              💾
            </button>
            {Object.keys(saved).length > 0 && (
              <div className="text-xs text-slate-500">Saved: {Object.keys(saved).length}</div>
            )}
          </div>
        </div>

        <div className="space-y-3 card">
          <h2 className="font-semibold">Date Range</h2>
          <label className="block text-sm">Start</label>
          <input
            type="date"
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <label className="block text-sm">End</label>
          <input
            type="date"
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500">Presets:</span>
            <button
              type="button"
              className={`btn btn-muted px-2 py-1 text-xs ${start===format(subYears(new Date(),1),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "ring-2 ring-blue-400" : ""}`}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 1), "yyyy-MM-dd"));
              }}
            >
              1Y
            </button>
            <button
              type="button"
              className={`btn btn-muted px-2 py-1 text-xs ${start===format(subYears(new Date(),2),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "ring-2 ring-blue-400" : ""}`}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 2), "yyyy-MM-dd"));
              }}
            >
              2Y
            </button>
            <button
              type="button"
              className={`btn btn-muted px-2 py-1 text-xs ${start===format(subYears(new Date(),3),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "ring-2 ring-blue-400" : ""}`}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 3), "yyyy-MM-dd"));
              }}
            >
              3Y
            </button>
            <button
              type="button"
              className={`btn btn-muted px-2 py-1 text-xs ${start===format(subYears(new Date(),5),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "ring-2 ring-blue-400" : ""}`}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 5), "yyyy-MM-dd"));
              }}
            >
              5Y
            </button>
          </div>
          <label className="block text-sm">Initial Capital</label>
          <input
            type="number"
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={initialCapital}
            min={1}
            step={1}
            onChange={(e) => setInitialCapital(Math.max(1, Number(e.target.value)))}
          />
        </div>

        <div className="space-y-3 card">
          <h2 className="font-semibold">Rebalancing</h2>
          <select
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="none">None</option>
            <option value="periodic">Periodic (days)</option>
            <option value="threshold">Threshold (%)</option>
          </select>
          {mode === "periodic" && (
            <input
              type="number"
              className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
            />
          )}
          {mode === "threshold" && (
            <input
              type="number"
              className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={thresholdPct}
              onChange={(e) => setThresholdPct(Number(e.target.value))}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={loading || Math.abs(allocationSum - 1) > 1e-4}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {loading ? "Running..." : "Run Backtest"}
            </button>
            <button
              onClick={() => setAllocations([{ id: "usd-coin", allocation: 0.8 }, { id: "bitcoin", allocation: 0.2 }])}
              className="btn btn-muted"
            >
              Reset
            </button>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      </section>

      {loading && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card skeleton h-20" />
            <div className="card skeleton h-20" />
            <div className="card skeleton h-20" />
            <div className="card skeleton h-20" />
          </div>
          <div className="h-96 w-full card skeleton" />
        </section>
      )}

      {result && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
            <Metric label="Final Value" value={result.metrics.finalValue.toFixed(2)} />
            <Metric label="Cumulative %" value={result.metrics.cumulativeReturnPct.toFixed(2)} />
            <Metric label="CAGR %" value={result.metrics.cagrPct.toFixed(2)} />
            <Metric label="Max DD %" value={result.metrics.maxDrawdownPct.toFixed(2)} />
            <Metric label="Sharpe" value={result.metrics.sharpe == null ? "—" : result.metrics.sharpe.toFixed(2)} />
          </div>
          <div className="h-80 sm:h-96 w-full card">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="value" stroke="#60a5fa" dot={false} name="Portfolio" strokeWidth={2} />
                <Line type="monotone" dataKey="invested" stroke="#94a3b8" dot={false} name="Invested" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {result?.integrity && (
        <section className="space-y-2">
          <div className="card flex items-center justify-between">
            <div className="font-semibold">Backtest Integrity</div>
            <div className="text-sm">Score: {result.integrity.score}/100</div>
          </div>
          {result.integrity.issues.length > 0 ? (
            <div className="card">
              <div className="text-sm font-semibold mb-1">Issues detected</div>
              <ul className="list-disc pl-5 text-sm text-red-500">
                {result.integrity.issues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card text-sm text-emerald-600">No issues detected.</div>
          )}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

type TooltipPayloadItem = { dataKey: string; value: number; color?: string; name?: string };
type TooltipProps = { active?: boolean; payload?: TooltipPayloadItem[]; label?: string };
function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload.find((p) => p.dataKey === "value")?.value;
  const invested = payload.find((p) => p.dataKey === "invested")?.value;
  const growth = value && invested ? ((value / invested - 1) * 100).toFixed(2) : "";
  const assetItems = payload.filter((p) => (p.dataKey || "").endsWith("_price"));
  return (
    <div className="tooltip-card">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-3">
        <div className="chip">Portfolio</div>
        <div className="font-semibold">{typeof value === "number" ? value.toFixed(2) : value}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="chip">Invested</div>
        <div>{typeof invested === "number" ? invested.toFixed(2) : invested}</div>
      </div>
      {growth && <div className="text-xs text-slate-500">Growth: {growth}%</div>}
      {assetItems.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-semibold mb-1">Assets</div>
          <div className="grid grid-cols-1 gap-1">
            {assetItems.map((it) => {
              const id = it.dataKey.replace("_price", "");
              const weightKey = `${id}_weight`;
              const weight = payload.find((p) => p.dataKey === weightKey)?.value as number | undefined;
              return (
                <div key={id} className="flex items-center justify-between">
                  <span className="text-xs">{id} price</span>
                  <span className="text-xs font-mono">{typeof it.value === "number" ? it.value.toFixed(4) : it.value}</span>
                  {typeof weight === "number" && (
                    <span className="text-xs">{weight.toFixed(2)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
