import { differenceInCalendarDays } from "date-fns";
import type {
  BacktestMetrics,
  BacktestRequest,
  BacktestResponse,
  PortfolioAsset,
  PricePoint,
} from "./types";
import { fetchPrices, fetchCurrentPricesUSD, fetchCoinData, fetchMarketData, fetchOHLCData, type CoinGeckoCoin, type CoinGeckoMarketData } from "./prices";

function alignTimeline(priceSeries: Record<string, PricePoint[]>): string[] {
  const allDates = new Set<string>();
  for (const [assetId, series] of Object.entries(priceSeries)) {
    console.log(`Processing ${assetId} with ${series.length} price points`);
    for (const p of series) {
      allDates.add(p.date);
    }
  }
  const timeline = Array.from(allDates).sort();
  console.log(`Generated timeline with ${timeline.length} dates`);
  return timeline;
}

function interpolateLastKnown(
  series: PricePoint[],
  timeline: string[]
): number[] {
  const dateToPrice = new Map(series.map((p) => [p.date, p.price] as const));
  const out: number[] = [];
  let last: number | null = null;
  for (const d of timeline) {
    const price = dateToPrice.get(d);
    if (price != null) last = price;
    // Forward-fill only. Before the first known price, keep NaN to signal "no data yet".
    out.push(last ?? NaN);
  }
  return out;
}

function computeMetrics(values: number[], dates: string[], riskFreeRatePct = 0): BacktestMetrics {
  const initialCapital = values[0];
  const finalValue = values[values.length - 1];
  const cumulativeReturn = finalValue / initialCapital - 1;
  const tradingDays = values.length;

  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const years = Math.max(1 / 365, differenceInCalendarDays(new Date(endDate), new Date(startDate)) / 365);
  const cagr = Math.pow(finalValue / initialCapital, 1 / years) - 1;

  const dailyReturns: number[] = [];
  let prev = values[0];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] / prev - 1;
    dailyReturns.push(r);
    prev = values[i];
  }
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturns.length);
  const variance =
    dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, dailyReturns.length);
  const stdDaily = Math.sqrt(variance);
  const volatility = stdDaily * Math.sqrt(252);
  const bestDay = Math.max(...dailyReturns);
  const worstDay = Math.min(...dailyReturns);
  const rfDaily = riskFreeRatePct / 100 / 252;
  const sharpe = stdDaily > 0 ? ((mean - rfDaily) * Math.sqrt(252)) / stdDaily : null;

  // Max drawdown
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < maxDd) maxDd = dd;
  }

  return {
    startDate,
    endDate,
    tradingDays,
    initialCapital,
    finalValue,
    cumulativeReturnPct: cumulativeReturn * 100,
    cagrPct: cagr * 100,
    volatilityPct: volatility * 100,
    sharpe,
    maxDrawdownPct: maxDd * 100,
    bestDayPct: bestDay * 100,
    worstDayPct: worstDay * 100,
  };
}

export function runBacktest(
  req: BacktestRequest,
  priceSeries: Record<string, PricePoint[]>
): BacktestResponse {
  console.log('Backtest input - priceSeries lengths:', Object.entries(priceSeries).map(([key, value]) => `${key}: ${value.length}`));
  
  const timeline = alignTimeline(priceSeries);

  // Integrity tracking
  const integrityIssues: string[] = [];
  const assetHadAnyPrice: Record<string, boolean> = {};
  const perAssetPrices: Record<string, number[]> = {};
  for (const [id, series] of Object.entries(priceSeries)) {
    const interpolated = interpolateLastKnown(series, timeline);
    perAssetPrices[id] = interpolated;
    assetHadAnyPrice[id] = series.length > 0;
    const missingPoints = interpolated.filter((x) => Number.isNaN(x)).length;
    if (!assetHadAnyPrice[id]) {
      integrityIssues.push(`No price data for ${id} in selected range`);
    } else if (missingPoints > 0) {
      integrityIssues.push(`Missing price points filled for ${id}: ${missingPoints}`);
    }
  }

  // If timeline is empty, return a minimal response with degraded integrity
  if (timeline.length === 0) {
    integrityIssues.push("No price data available for any asset in selected range");
    const initialCapital = req.initialCapital ?? 100;
    return {
      series: { timeline: [], portfolio: [], perAssetValues: {} },
      metrics: {
        startDate: req.startDate,
        endDate: req.endDate,
        tradingDays: 0,
        initialCapital,
        finalValue: initialCapital,
        cumulativeReturnPct: 0,
        cagrPct: 0,
        volatilityPct: 0,
        sharpe: null,
        maxDrawdownPct: 0,
        bestDayPct: 0,
        worstDayPct: 0,
      },
      risk: { perAssetVolatilityPct: {}, riskReward: null } as unknown as { perAssetVolatilityPct: Record<string, number>; riskReward: number | null },
      integrity: { score: Math.max(0, 100 - integrityIssues.length * 15), issues: integrityIssues },
    } as unknown as BacktestResponse;
  }

  const initialCapital = req.initialCapital ?? 100;
  const targetWeights = Object.fromEntries(
    req.assets.map((a) => [a.id, a.allocation] as const)
  );

  // initial units per asset
  const firstPrices: Record<string, number> = Object.fromEntries(
    Object.entries(perAssetPrices).map(([id, prices]) => [id, prices[0]])
  );
  const units: Record<string, number> = {};
  const pendingCashByAsset: Record<string, number> = {};
  const firstValidIndex: Record<string, number> = {};
  for (const [id, prices] of Object.entries(perAssetPrices)) {
    let idx = -1;
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      if (Number.isFinite(p) && p > 0) {
        idx = i; break;
      }
    }
    firstValidIndex[id] = idx;
  }
  for (const a of req.assets) {
    const allocValue = initialCapital * a.allocation;
    const p0 = firstPrices[a.id];
    if (Number.isFinite(p0) && p0 > 0 && (firstValidIndex[a.id] ?? -1) <= 0) {
      units[a.id] = allocValue / (p0 as number);
    } else {
      units[a.id] = 0;
      pendingCashByAsset[a.id] = (pendingCashByAsset[a.id] ?? 0) + allocValue;
    }
  }

  const portfolioValues: number[] = [];
  const perAssetValues: Record<string, number[]> = Object.fromEntries(
    req.assets.map((a) => [a.id, [] as number[]])
  );
  const perAssetPricesOut: Record<string, number[]> = Object.fromEntries(
    req.assets.map((a) => [a.id, [] as number[]])
  );
  const perAssetWeightsOut: Record<string, number[]> = Object.fromEntries(
    req.assets.map((a) => [a.id, [] as number[]])
  );

  function convertPendingIfAvailable(index: number) {
    for (const a of req.assets) {
      const cash = pendingCashByAsset[a.id] ?? 0;
      if (cash > 0) {
        const p = perAssetPrices[a.id][index];
        if (Number.isFinite(p) && p > 0) {
          units[a.id] = cash / p;
          pendingCashByAsset[a.id] = 0;
        }
      }
    }
  }

  function valueAt(index: number): number {
    let v = 0;
    for (const a of req.assets) {
      const p = perAssetPrices[a.id][index];
      const price = Number.isFinite(p) && p > 0 ? p : 0;
      v += units[a.id] * price;
    }
    const cashSum = Object.values(pendingCashByAsset).reduce((s, c) => s + (c || 0), 0);
    return v + cashSum;
  }

  function maybeRebalance(index: number) {
    const mode = req.rebalance.mode;
    if (mode === "none") return;

    const currentValue = valueAt(index);
    const currentWeights: Record<string, number> = {};
    for (const a of req.assets) {
      const value = units[a.id] * perAssetPrices[a.id][index];
      currentWeights[a.id] = currentValue > 0 ? value / currentValue : 0;
    }

    let should = false;
    if (mode === "periodic") {
      const periodDays = req.rebalance.periodDays ?? 30;
      if (index > 0 && index % periodDays === 0) should = true;
    } else if (mode === "threshold") {
      const threshold = (req.rebalance.thresholdPct ?? 5) / 100;
      should = Object.keys(currentWeights).some((id) =>
        Math.abs(currentWeights[id] - (targetWeights[id] ?? 0)) > threshold
      );
    }
    if (!should) return;

    // Rebalance: sell all to cash then buy to target weights at current prices
    for (const _ of req.assets) {
      // no-op loop; we compute total via pricesNow below
    }
    const pricesNow: Record<string, number> = Object.fromEntries(
      req.assets.map((a) => {
        const p = perAssetPrices[a.id][index];
        return [a.id, Number.isFinite(p) && p > 0 ? p : 0];
      })
    );
    const total = Object.entries(units).reduce(
      (sum, [id, u]) => sum + u * pricesNow[id],
      0
    );
    for (const a of req.assets) {
      const targetValue = total * (targetWeights[a.id] ?? 0);
      const p = pricesNow[a.id];
      units[a.id] = p > 0 ? targetValue / p : 0;
    }
  }

  const cashSeries: number[] = [];
  for (let i = 0; i < timeline.length; i++) {
    // Convert any pending cash for assets that become available now
    convertPendingIfAvailable(i);
    maybeRebalance(i);
    const cashNow = Object.values(pendingCashByAsset).reduce((s, c) => s + (c || 0), 0);
    const v = valueAt(i);
    cashSeries.push(cashNow);
    portfolioValues.push(v);
    for (const a of req.assets) {
      const p = perAssetPrices[a.id][i];
      const price = Number.isFinite(p) && p > 0 ? p : 0;
      const value = units[a.id] * price;
      perAssetValues[a.id].push(value);
      perAssetPricesOut[a.id].push(price);
      perAssetWeightsOut[a.id].push(v > 0 ? value / v : 0);
    }
  }

  const metrics = computeMetrics(
    portfolioValues,
    timeline,
    req.riskFreeRatePct ?? 0
  );

  // Per-asset volatility (annualized)
  const perAssetVolatilityPct: Record<string, number> = {};
  for (const a of req.assets) {
    const prices = perAssetPricesOut[a.id];
    const dailyReturns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const p0 = prices[i - 1];
      const p1 = prices[i];
      if (p0 > 0 && p1 > 0) dailyReturns.push(p1 / p0 - 1);
    }
    const mean = dailyReturns.reduce((s, r) => s + r, 0) / Math.max(1, dailyReturns.length);
    const variance =
      dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / Math.max(1, dailyReturns.length);
    const stdDaily = Math.sqrt(variance);
    perAssetVolatilityPct[a.id] = stdDaily * Math.sqrt(252) * 100;
  }

  const riskReward = metrics.volatilityPct > 0 ? metrics.cagrPct / metrics.volatilityPct : null;

  // Integrity checks
  // weights sum approx 1
  for (let i = 0; i < timeline.length; i++) {
    let sum = 0;
    for (const a of req.assets) sum += perAssetWeightsOut[a.id][i] ?? 0;
    const v = portfolioValues[i] || 0;
    const cashW = v > 0 ? (cashSeries[i] || 0) / v : 0;
    sum += cashW;
    if (Math.abs(sum - 1) > 1e-3) {
      integrityIssues.push(`Weights not summing to 1 at ${timeline[i]}: ${sum.toFixed(4)}`);
      break;
    }
  }
  // prices positive
  for (const a of req.assets) {
    if (perAssetPricesOut[a.id].some((p) => !(p > 0))) {
      integrityIssues.push(`Non-positive or missing prices detected for ${a.id}`);
    }
  }
  // value equals sum of per-asset values
  for (let i = 0; i < timeline.length; i++) {
    const sum = req.assets.reduce((s, a) => s + perAssetValues[a.id][i], 0);
    if (Math.abs(sum - portfolioValues[i]) > Math.max(1e-6 * portfolioValues[i], 1e-6)) {
      integrityIssues.push(`Portfolio value mismatch at ${timeline[i]}`);
      break;
    }
  }
  const integrityScore = Math.max(0, 100 - integrityIssues.length * 10);

  return {
    series: {
      timeline,
      portfolio: timeline.map((d, i) => ({ date: d, value: portfolioValues[i] })),
      perAssetValues,
      perAssetPrices: perAssetPricesOut,
      perAssetWeights: perAssetWeightsOut,
    },
    metrics,
    risk: { perAssetVolatilityPct, riskReward } as unknown as { perAssetVolatilityPct: Record<string, number>; riskReward: number | null },
    integrity: { score: integrityScore, issues: integrityIssues },
  } as unknown as BacktestResponse;
}



