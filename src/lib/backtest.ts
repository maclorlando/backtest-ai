import { differenceInCalendarDays } from "date-fns";
import type {
  BacktestMetrics,
  BacktestRequest,
  BacktestResponse,
  PortfolioAsset,
  PricePoint,
} from "./types";

function alignTimeline(priceSeries: Record<string, PricePoint[]>): string[] {
  const allDates = new Set<string>();
  for (const series of Object.values(priceSeries)) {
    for (const p of series) allDates.add(p.date);
  }
  return Array.from(allDates).sort();
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
    out.push(last ?? NaN);
  }
  // Forward/back fill edge NaNs with first known price
  let firstKnown = out.find((x) => !Number.isNaN(x));
  if (firstKnown == null) firstKnown = NaN;
  for (let i = 0; i < out.length; i++) if (Number.isNaN(out[i])) out[i] = firstKnown;
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
  const timeline = alignTimeline(priceSeries);
  const perAssetPrices: Record<string, number[]> = {};
  for (const [id, series] of Object.entries(priceSeries)) {
    perAssetPrices[id] = interpolateLastKnown(series, timeline);
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
  for (const a of req.assets) {
    const allocValue = initialCapital * a.allocation;
    const p0 = firstPrices[a.id];
    units[a.id] = p0 > 0 ? allocValue / p0 : 0;
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

  function valueAt(index: number): number {
    let v = 0;
    for (const a of req.assets) v += units[a.id] * perAssetPrices[a.id][index];
    return v;
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
      req.assets.map((a) => [a.id, perAssetPrices[a.id][index]])
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

  for (let i = 0; i < timeline.length; i++) {
    maybeRebalance(i);
    const v = valueAt(i);
    portfolioValues.push(v);
    for (const a of req.assets) {
      const price = perAssetPrices[a.id][i];
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

  // Integrity checks
  const integrityIssues: string[] = [];
  // weights sum approx 1
  for (let i = 0; i < timeline.length; i++) {
    let sum = 0;
    for (const a of req.assets) sum += perAssetWeightsOut[a.id][i] ?? 0;
    if (Math.abs(sum - 1) > 1e-3) {
      integrityIssues.push(`Weights not summing to 1 at ${timeline[i]}: ${sum.toFixed(4)}`);
      break;
    }
  }
  // prices positive
  for (const a of req.assets) {
    if (perAssetPricesOut[a.id].some((p) => !(p > 0))) {
      integrityIssues.push(`Non-positive prices detected for ${a.id}`);
      break;
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
    // @ts-expect-error extra field for UI
    integrity: { score: integrityScore, issues: integrityIssues },
  };
}


