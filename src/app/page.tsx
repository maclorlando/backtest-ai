"use client";
import React, { useMemo, useState, useEffect } from "react";
import { format, subYears } from "date-fns";
import Image from "next/image";
import { ASSET_ID_TO_SYMBOL, type AssetId, type BacktestRequest, type BacktestResponse } from "@/lib/types";
import { fetchCoinLogos, fetchCurrentPricesUSD } from "@/lib/prices";
import { Select, Card, Group, Grid, ActionIcon, Text, Title, NumberInput, Button, Badge, Tooltip as MantineTooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconX, IconPlus, IconDeviceFloppy, IconSun, IconMoon } from "@tabler/icons-react";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import PortfolioChart from "@/components/charts/PortfolioChart";
import ComparisonChart from "@/components/charts/ComparisonChart";

type AllocationRow = { id: AssetId; allocation: number };

export default function Home() {
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    { id: "usd-coin", allocation: 0.8 },
    { id: "bitcoin", allocation: 0.2 },
  ]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
  const [toast, setToast] = useState<string | null>(null);
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
    notifications.show({ title: "Saved", message: `Saved portfolio '${name}'`, color: "blue" });
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
      if (Array.isArray(data?.integrity?.issues) && data.integrity.issues.length > 0) {
        notifications.show({ title: "Backtest completed with warnings", message: `${data.integrity.issues.length} data quality issue(s) detected`, color: "yellow" });
      } else {
        notifications.show({ title: "Backtest", message: "Completed successfully", color: "green" });
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
      notifications.show({ title: "Compare", message: msg, color: "red" });
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

  return (
    <main className="space-y-6">
      <Card padding="lg" shadow="sm" radius="md" withBorder>
        <Group justify="space-between" align="center">
          <Title order={3}>Crypto Portfolio Backtester</Title>
          <Group>
            <ActionIcon 
              variant="light" 
              color={theme === "dark" ? "yellow" : "blue"}
              onClick={() => {
                setTheme((t) => {
                  const next = t === "dark" ? "light" : "dark";
                  if (next === "light") document.documentElement.classList.remove("dark");
                  else document.documentElement.classList.add("dark");
                  sessionStorage.setItem("bt_theme", next);
                  return next;
                });
              }} 
              aria-label="Toggle theme"
              size="lg"
            >
              {theme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
            </ActionIcon>
            <Text size="sm" c="dimmed">Price data by <a className="underline" href="https://www.coingecko.com" target="_blank" rel="noreferrer">CoinGecko</a></Text>
          </Group>
        </Group>
      </Card>

      {/* Mantine notifications handle toasts now */}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card withBorder shadow="sm" padding="md">
          <Text size="lg" fw={600}>Assets & Allocations</Text>
          {allocations.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select
                data={([
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
                ] as AssetId[]).map((id) => ({
                  value: id,
                  label: ASSET_ID_TO_SYMBOL[id],
                }))}
                value={row.id}
                onChange={(val) => {
                  if (!val) return;
                  const copy = [...allocations];
                  copy[idx] = { ...row, id: val as AssetId };
                  setAllocations(copy);
                }}
                searchable
                nothingFoundMessage="No asset"
                renderOption={({ option }) => {
                  const id = option.value as string;
                  const symbol = option.label as string;
                  const px = spot[id];
                  return (
                    <div className="flex items-center justify-between w-full gap-3 px-1 py-1.5" style={{ minWidth: 240 }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {logos[id] && (
                          <Image src={logos[id]} alt={id} width={20} height={20} />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{symbol}</div>
                          <div className="text-[10px] text-slate-500 truncate">{id}</div>
                        </div>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {typeof px === "number" ? `$${px.toFixed(4)}` : ""}
                      </div>
                    </div>
                  );
                }}
                className="flex-1"
              />
              <NumberInput
                value={row.allocation}
                onChange={(val) => {
                  const next = Number(val);
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
                decimalScale={4}
                size="xs"
                w={80}
              />
              <ActionIcon
                variant="light"
                color="red"
                size="xs"
                onClick={() => setAllocations((arr) => arr.filter((_, i) => i !== idx))}
                aria-label="Remove asset"
              >
                <IconX size={14} />
              </ActionIcon>
            </div>
          ))}
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAllocations((a) => [...a, { id: "bitcoin", allocation: 0 }])}
          >
            Add Asset
          </Button>
          <div className="text-sm text-gray-600">Sum: {(Math.round(allocationSum * 10000) / 10000).toFixed(2)}</div>
          <div className="flex items-center gap-2 pt-2">
            <ActionIcon variant="light" onClick={() => { saveCurrentPortfolio().catch(()=>{}); }} aria-label="Save">
              <IconDeviceFloppy size={16} />
            </ActionIcon>
            {mounted && Object.keys(saved).length > 0 && (
              <div className="text-xs text-slate-500">Saved: {Object.keys(saved).length}</div>
            )}
        </div>
        </Card>

        <Card withBorder shadow="sm" padding="md">
          <Text size="lg" fw={600}>Date Range</Text>
          <Text size="sm" fw={500}>Start</Text>
          <input
            type="date"
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Text size="sm" fw={500}>End</Text>
          <input
            type="date"
            className="border rounded p-2 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-slate-500">Presets:</span>
            <Button
              size="xs"
              variant={start===format(subYears(new Date(),1),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "filled" : "light"}
              color={start===format(subYears(new Date(),1),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "blue" : "gray"}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 1), "yyyy-MM-dd"));
              }}
            >
              1Y
            </Button>
            <Button
              size="xs"
              variant={start===format(subYears(new Date(),2),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "filled" : "light"}
              color={start===format(subYears(new Date(),2),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "blue" : "gray"}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 2), "yyyy-MM-dd"));
              }}
            >
              2Y
            </Button>
            <Button
              size="xs"
              variant={start===format(subYears(new Date(),3),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "filled" : "light"}
              color={start===format(subYears(new Date(),3),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "blue" : "gray"}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 3), "yyyy-MM-dd"));
              }}
            >
              3Y
            </Button>
            <Button
              size="xs"
              variant={start===format(subYears(new Date(),5),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "filled" : "light"}
              color={start===format(subYears(new Date(),5),"yyyy-MM-dd") && end===format(new Date(),"yyyy-MM-dd") ? "blue" : "gray"}
              onClick={() => {
                const now = new Date();
                setEnd(format(now, "yyyy-MM-dd"));
                setStart(format(subYears(now, 5), "yyyy-MM-dd"));
              }}
            >
              5Y
            </Button>
          </div>
          <Text size="sm" fw={500}>Initial Capital</Text>
          <NumberInput value={initialCapital} min={1} step={1} onChange={(v) => setInitialCapital(Number(v) || 1)} />
        </Card>

        <Card withBorder shadow="sm" padding="md">
          <Text size="lg" fw={600}>Rebalancing</Text>
          <Select
            data={[
              { value: "none", label: "None" },
              { value: "periodic", label: "Periodic (days)" },
              { value: "threshold", label: "Threshold (%)" },
            ]}
            value={mode}
            onChange={(val) => setMode((val as typeof mode) || "none")}
          />
          {mode === "periodic" && (
            <NumberInput
              value={periodDays}
              onChange={(v) => setPeriodDays(Number(v) || 0)}
              min={1}
            />
          )}
          {mode === "threshold" && (
            <NumberInput
              value={thresholdPct}
              onChange={(v) => setThresholdPct(Number(v) || 0)}
              min={1}
            />
          )}
          <div className="flex gap-2">
            <Button onClick={run} loading={loading} disabled={Math.abs(allocationSum - 1) > 1e-4} fullWidth>
              Run Backtest
            </Button>
            <Button
              variant="default"
              onClick={() => setAllocations([{ id: "usd-coin", allocation: 0.8 }, { id: "bitcoin", allocation: 0.2 }])}
            >
              Reset
            </Button>
          </div>
          {error && <Text c="red" size="sm">{error}</Text>}
        </Card>
        <Card withBorder shadow="sm" padding="md">
          <div className="flex items-center justify-between">
            <Text size="lg" fw={600}>Saved Portfolios</Text>
            <Button size="xs" variant="light" onClick={() => compareAll().catch(()=>{})} disabled={!mounted || Object.keys(saved).length === 0}>
              Compare All
            </Button>
          </div>
          <div className="saved-grid mt-2" style={{ maxHeight: 260, overflowY: "auto" }}>
            {Object.entries(saved).map(([name, cfg]) => (
              <div
                key={name}
                className="card saved-card hover-panel p-3"
                onClick={() => {
                  setAllocations([...cfg.allocations]);
                  setStart(cfg.start);
                  setEnd(cfg.end);
                  setMode(cfg.mode);
                  setPeriodDays(cfg.periodDays ?? 30);
                  setThresholdPct(cfg.thresholdPct ?? 5);
                  setInitialCapital(cfg.initialCapital ?? 100);
                  notifications.show({ title: "Loaded", message: `Loaded '${name}'`, color: "blue" });
                }}
              >
                <div className="flex items-center justify-between">
                  <Text size="sm" fw={600}>{name}</Text>
                                      <ActionIcon
                      variant="light"
                      color="red"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next: Record<string, SavedRecord> = { ...saved };
                        delete next[name];
                        setSaved(next);
                        localStorage.setItem("bt_portfolios", JSON.stringify(next));
                      }}
                      aria-label="Delete portfolio"
                    >
                      <IconX size={14} />
                    </ActionIcon>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {cfg.allocations.map((a) => `${a.id}:${Math.round(a.allocation*100)}%`).join(" · ")}
                </div>
                <div className="text-xs mt-1">{cfg.start} → {cfg.end}</div>
                <div className="text-xs">Cap: {cfg.initialCapital}</div>
                {cfg.kpis && (
                  <div className="text-xs mt-2 grid grid-cols-2 gap-1">
                    <span>CAGR</span><span>{cfg.kpis.cagrPct.toFixed(2)}%</span>
                    <span>Vol</span><span>{cfg.kpis.volPct.toFixed(2)}%</span>
                    <span>MaxDD</span><span>{cfg.kpis.maxDdPct.toFixed(2)}%</span>
                    <span>R:R</span><span>{cfg.kpis.rr == null ? "—" : cfg.kpis.rr.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </section>

        {comparisonLines.length > 0 && (
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Text size="xl" fw={700}>Portfolio Comparison</Text>
                  <Text size="sm" c="dimmed">
                    Comparing {comparisonLines.length} saved portfolios
                  </Text>
                </div>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    setComparisonLines([]);
                    setComparisonData([]);
                  }}
                >
                  Close Comparison
                </Button>
              </div>
              <ComparisonChart data={comparisonData} lines={comparisonLines} />
            </div>
          </section>
        )}

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
          <Grid gutter="sm" align="center">
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="Final Value" value={result.metrics.finalValue.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="Cumulative %" value={result.metrics.cumulativeReturnPct.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="CAGR %" value={result.metrics.cagrPct.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="Max DD %" value={result.metrics.maxDrawdownPct.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="Sharpe" value={result.metrics.sharpe == null ? "—" : result.metrics.sharpe.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="R:R (CAGR/Vol)" value={result.risk?.riskReward == null ? "—" : result.risk.riskReward.toFixed(2)} />
            </Grid.Col>
            <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
              <Metric label="Vol %" value={
                typeof (result as BacktestUIResult & { metrics: { volatilityPct?: number } }).metrics.volatilityPct === "number"
                  ? ((result as BacktestUIResult & { metrics: { volatilityPct?: number } }).metrics.volatilityPct as number).toFixed(2)
                  : "—"
              } />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4, md: 2 }}>
              <div className="flex items-center gap-6">
                <MantineTooltip label={
                  result.integrity?.issues?.length
                    ? `${result.integrity.issues.length} issue(s):\n` + result.integrity.issues.slice(0, 6).join("\n") + (result.integrity.issues.length > 6 ? "\n…" : "")
                    : "No issues detected"
                } multiline position="bottom">
                  <Badge color={result.integrity && result.integrity.score >= 90 ? "green" : result.integrity && result.integrity.score >= 70 ? "yellow" : "red"} variant="light">
                    Data Quality {result.integrity ? result.integrity.score : 0}/100
                  </Badge>
                </MantineTooltip>
              </div>
            </Grid.Col>
          </Grid>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Text size="xl" fw={700}>Portfolio Performance</Text>
                <Text size="sm" c="dimmed">
                  {allocations.map(a => `${ASSET_ID_TO_SYMBOL[a.id]} ${(a.allocation * 100).toFixed(1)}%`).join(" • ")}
                </Text>
              </div>
              <div className="text-right">
                <Text size="sm" fw={600}>Final Value: ${result.metrics.finalValue.toFixed(2)}</Text>
                <Text size="sm" c={result.metrics.cumulativeReturnPct >= 0 ? "green" : "red"}>
                  {result.metrics.cumulativeReturnPct >= 0 ? "+" : ""}{result.metrics.cumulativeReturnPct.toFixed(2)}% ({result.metrics.cagrPct >= 0 ? "+" : ""}{result.metrics.cagrPct.toFixed(2)}% CAGR)
                </Text>
              </div>
            </div>
            <PortfolioChart data={chartData} />
          </div>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Card withBorder shadow="sm" padding="md">
                <Text size="sm" fw={600} mb={6}>Per-Asset Risk (Vol %)</Text>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(result.risk?.perAssetVolatilityPct || {}).map(([id, v]) => (
                    <div key={id} className="flex items-center justify-between"><span>{id}</span><span>{v.toFixed(2)}</span></div>
                  ))}
                </div>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Card withBorder shadow="sm" padding="md">
                <Text size="sm" fw={600} mb={6}>End Capital</Text>
                <Text size="lg" fw={700}>{result.metrics.finalValue.toFixed(2)}</Text>
              </Card>
            </Grid.Col>
          </Grid>
        </section>
      )}

      {result?.integrity && (
        <section className="space-y-2">
          <Card withBorder shadow="sm" padding="md">
            <Group justify="space-between" align="center">
              <Text size="lg" fw={600}>Backtest Integrity</Text>
              <Text size="sm">Score: {result.integrity.score}/100</Text>
            </Group>
          </Card>
          {result.integrity.issues.length > 0 ? (
            <Card withBorder shadow="sm" padding="md">
              <Text size="sm" fw={600} mb={8}>Issues detected</Text>
              <ul className="list-disc pl-5 text-sm text-red-500">
                {result.integrity.issues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </Card>
                      ) : (
              <Card withBorder shadow="sm" padding="md">
                <Text size="sm" c="green">No issues detected.</Text>
              </Card>
            )}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
              <Card withBorder shadow="sm" padding="md">
            <Text size="sm" c="dimmed">{label}</Text>
            <Text size="xl" fw={700}>{value}</Text>
          </Card>
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

function ComparisonTooltip({ active, payload, label, lines }: TooltipProps & { lines: { key: string; name: string; color: string; kpis: { cagrPct: number; volPct: number; maxDdPct: number; rr: number | null } }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="tooltip-card">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="grid grid-cols-1 gap-1">
        {lines.map((ln) => {
          const item = payload.find((p) => p.dataKey === ln.key);
          const v = item?.value;
          return (
            <div key={ln.key} className="flex items-center justify-between gap-3">
              <div className="chip" style={{ background: `${ln.color}20`, color: ln.color }}>{ln.name}</div>
              <div className="font-semibold">{typeof v === "number" ? v.toFixed(2) : v}</div>
              <div className="text-xs text-slate-500">
                CAGR {ln.kpis.cagrPct.toFixed(2)}% · Vol {ln.kpis.volPct.toFixed(2)}% · MaxDD {ln.kpis.maxDdPct.toFixed(2)}% · R:R {ln.kpis.rr == null ? "—" : ln.kpis.rr.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
