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

// NEW: Enhanced backtesting functions using CoinGecko API

/**
 * Enhanced backtest with market data and technical analysis
 */
export async function enhancedBacktest(
  strategy: Strategy,
  startDate: string,
  endDate: string,
  initialBalance: number,
  options?: {
    coingeckoApiKey?: string;
    includeMarketData?: boolean;
    includeTechnicalAnalysis?: boolean;
  }
): Promise<{
  portfolio: Portfolio;
  trades: Trade[];
  metrics: BacktestMetrics;
  marketData?: Record<string, CoinGeckoMarketData>;
  technicalData?: Record<string, any>;
}> {
  const { portfolio, trades, metrics } = await backtest(strategy, startDate, endDate, initialBalance);
  
  const enhanced: any = { portfolio, trades, metrics };
  
  // Fetch enhanced market data if requested
  if (options?.includeMarketData) {
    try {
      const assetIds = Object.keys(strategy.assets);
      const marketData = await fetchMarketData(assetIds, options.coingeckoApiKey);
      enhanced.marketData = marketData.reduce((acc, coin) => {
        acc[coin.id] = coin;
        return acc;
      }, {} as Record<string, CoinGeckoMarketData>);
    } catch (error) {
      console.warn("Failed to fetch enhanced market data:", error);
    }
  }
  
  // Fetch technical analysis data if requested
  if (options?.includeTechnicalAnalysis) {
    try {
      const technicalData: Record<string, any> = {};
      for (const assetId of Object.keys(strategy.assets)) {
        const ohlcData = await fetchOHLCData(assetId, 30, options.coingeckoApiKey); // 30 days of data
        if (ohlcData.length > 0) {
          technicalData[assetId] = calculateTechnicalIndicators(ohlcData);
        }
      }
      enhanced.technicalData = technicalData;
    } catch (error) {
      console.warn("Failed to fetch technical analysis data:", error);
    }
  }
  
  return enhanced;
}

/**
 * Calculate technical indicators from OHLC data
 */
function calculateTechnicalIndicators(ohlcData: Array<[number, number, number, number, number]>) {
  if (ohlcData.length < 14) return {};
  
  const closes = ohlcData.map(candle => candle[4]); // Close prices
  const highs = ohlcData.map(candle => candle[2]); // High prices
  const lows = ohlcData.map(candle => candle[3]); // Low prices
  
  // Calculate RSI (Relative Strength Index)
  const rsi = calculateRSI(closes, 14);
  
  // Calculate MACD (Moving Average Convergence Divergence)
  const macd = calculateMACD(closes);
  
  // Calculate Bollinger Bands
  const bollingerBands = calculateBollingerBands(closes, 20, 2);
  
  // Calculate Moving Averages
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  
  return {
    rsi: rsi[rsi.length - 1],
    macd: macd,
    bollingerBands: bollingerBands,
    sma20: sma20[sma20.length - 1],
    sma50: sma50[sma50.length - 1],
    currentPrice: closes[closes.length - 1],
    priceChange24h: closes[closes.length - 1] - closes[closes.length - 2],
    volatility: calculateVolatility(closes, 20)
  };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate gains and losses
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate RSI
  for (let i = period; i < gains.length; i++) {
    const avgGain = gains.slice(i - period, i).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(i - period, i).reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  const signalLine = calculateEMA([macdLine], 9)[0];
  const histogram = macdLine - signalLine;
  
  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const sma = calculateSMA(prices, period);
  const smaValue = sma[sma.length - 1];
  
  // Calculate standard deviation
  const recentPrices = prices.slice(-period);
  const mean = recentPrices.reduce((sum, price) => sum + price, 0) / period;
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: smaValue + (stdDev * standardDeviation),
    middle: smaValue,
    lower: smaValue - (stdDev * standardDeviation)
  };
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((acc, price) => acc + price, 0);
    sma.push(sum / period);
  }
  return sma;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  
  // Calculate EMA
  for (let i = period; i < prices.length; i++) {
    const newEMA = (prices[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(newEMA);
  }
  
  return ema;
}

/**
 * Calculate volatility (standard deviation of returns)
 */
function calculateVolatility(prices: number[], period: number = 20): number {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  const recentReturns = returns.slice(-period);
  const mean = recentReturns.reduce((sum, ret) => sum + ret, 0) / period;
  const variance = recentReturns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / period;
  
  return Math.sqrt(variance) * Math.sqrt(365); // Annualized volatility
}

/**
 * Get comprehensive coin information for strategy analysis
 */
export async function getCoinAnalysis(
  coinId: string,
  apiKey?: string
): Promise<{
  coinData: CoinGeckoCoin | null;
  marketData: CoinGeckoMarketData | null;
  technicalIndicators: any;
}> {
  try {
    const [coinData, marketData, ohlcData] = await Promise.all([
      fetchCoinData(coinId, apiKey),
      fetchMarketData([coinId], apiKey).then(data => data[0] || null),
      fetchOHLCData(coinId, 30, apiKey)
    ]);
    
    const technicalIndicators = ohlcData.length > 0 ? calculateTechnicalIndicators(ohlcData) : {};
    
    return {
      coinData,
      marketData,
      technicalIndicators
    };
  } catch (error) {
    console.warn(`Failed to get coin analysis for ${coinId}:`, error);
    return {
      coinData: null,
      marketData: null,
      technicalIndicators: {}
    };
  }
}


