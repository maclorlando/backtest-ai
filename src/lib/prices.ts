import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { AssetId, PricesByAsset, PricePoint } from "./types";

// Simple Coingecko daily close fetcher (free). For production, consider caching and retries.
// Coingecko: /coins/{id}/market_chart?vs_currency=usd&days=max

async function fetchCoingeckoDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  // Prefer unauthenticated endpoint to avoid 401. We'll request a large window and filter locally.
  // If a COINGECKO_API_KEY is set, use the pro API base with header.
  const apiKey = process.env.COINGECKO_API_KEY;
  const base = apiKey ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  // Use market_chart with 'days=max' for simplicity, then filter between from/to.
  const url = `${base}/coins/${assetId}/market_chart?vs_currency=usd&days=max`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-cg-pro-api-key"] = apiKey;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch prices for ${assetId}: ${res.status}`);
  }
  const data = await res.json();

  const startMs = from.getTime();
  const endMs = to.getTime();

  const byDay = new Map<string, number>();
  for (const [ts, price] of data.prices as [number, number][]) {
    if (ts < startMs || ts > endMs) continue;
    const day = format(new Date(ts), "yyyy-MM-dd");
    byDay.set(day, price);
  }
  const points: PricePoint[] = Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
  return points;
}

async function fetchBinanceDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const symbolMap: Partial<Record<AssetId, string>> = {
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    solana: "SOLUSDT",
  };
  const symbol = symbolMap[assetId];
  if (!symbol) return [];

  const limit = 1000; // max per request
  const points: PricePoint[] = [];
  let cursor = from.getTime();
  const endMs = to.getTime();
  while (cursor <= endMs) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${cursor}&endTime=${endMs}&limit=${limit}`;
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Binance ${assetId}: ${res.status}`);
    const data = (await res.json()) as unknown as Array<[
      number, // open time ms
      string, // open
      string, // high
      string, // low
      string, // close
      string, // volume
      number, // close time
      string, // quote asset volume
      number, // number of trades
      string, // taker buy base asset volume
      string, // taker buy quote asset volume
      string // ignore
    ]>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const openTime = row[0] as number; // ms
      const close = Number(row[4]);
      const date = format(new Date(openTime), "yyyy-MM-dd");
      points.push({ date, price: close });
    }
    const lastOpenTime = data[data.length - 1][0] as number;
    const next = lastOpenTime + 24 * 60 * 60 * 1000;
    if (next <= cursor) break;
    cursor = next;
  }
  // Deduplicate by date, last wins
  const byDay = new Map<string, number>();
  for (const p of points) byDay.set(p.date, p.price);
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
}

async function fetchCoinPaprikaDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const idMap: Record<AssetId, string> = {
    bitcoin: "btc-bitcoin",
    ethereum: "eth-ethereum",
    solana: "sol-solana",
    "usd-coin": "usdc-usd-coin",
    tether: "usdt-tether",
  };
  const paprikaId = idMap[assetId];
  if (!paprikaId) throw new Error(`No CoinPaprika mapping for ${assetId}`);
  // Paprika may reject long ranges; fetch in ~180-day chunks
  const chunkDays = 180;
  const chunks: PricePoint[] = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    const chunkStart = new Date(cursor);
    const chunkEnd = addDays(cursor, chunkDays);
    if (chunkEnd > to) {
      chunkEnd.setTime(to.getTime());
    }
    const start = format(chunkStart, "yyyy-MM-dd");
    const end = format(chunkEnd, "yyyy-MM-dd");
    const url = `https://api.coinpaprika.com/v1/tickers/${paprikaId}/historical?start=${start}&end=${end}&interval=1d`;
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Paprika ${assetId}: ${res.status}`);
    }
    type PaprikaRow = {
      time_open?: string;
      time_close?: string;
      timestamp?: string;
      open?: number;
      close?: number;
      price?: number;
    };
    const data = (await res.json()) as PaprikaRow[];
    for (const row of data) {
      const ts = row.time_close ?? row.timestamp ?? row.time_open;
      const dateObj = ts ? new Date(ts) : chunkEnd;
      const date = format(dateObj, "yyyy-MM-dd");
      const price = Number(row.close ?? row.price ?? row.open ?? 1);
      chunks.push({ date, price });
    }
    cursor = addDays(chunkEnd, 1);
  }
  // Deduplicate by date, last-value wins
  const byDay = new Map<string, number>();
  for (const p of chunks) byDay.set(p.date, p.price);
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, price]) => ({ date, price }));
}

function synthesizeStablecoin(from: Date, to: Date): PricePoint[] {
  const days = Math.max(0, differenceInCalendarDays(to, from));
  const out: PricePoint[] = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(from, i);
    out.push({ date: format(d, "yyyy-MM-dd"), price: 1 });
  }
  return out;
}

export async function fetchPrices(
  assetIds: AssetId[],
  start: string,
  end: string
): Promise<PricesByAsset> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const unique = Array.from(new Set(assetIds)).filter(Boolean);

  const results = await Promise.all(
    unique.map(async (id) => {
      // Try CoinGecko (with or without key)
      try {
        const cg = await fetchCoingeckoDailyPrices(id, startDate, endDate);
        if (cg.length > 0) return cg;
      } catch {
        // swallow and try fallback
      }
      // Try Binance for major pairs
      try {
        const bin = await fetchBinanceDailyPrices(id, startDate, endDate);
        if (bin.length > 0) return bin;
      } catch {
        // swallow and try fallback
      }
      // Stablecoin fallback
      if (id === "usd-coin" || id === "tether") {
        return synthesizeStablecoin(startDate, endDate);
      }
      // Try CoinPaprika
      const paprika = await fetchCoinPaprikaDailyPrices(id, startDate, endDate);
      return paprika;
    })
  );

  const out: PricesByAsset = {};
  unique.forEach((id, i) => (out[id] = results[i]));
  return out;
}


