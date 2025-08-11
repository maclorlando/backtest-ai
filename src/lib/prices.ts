import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { AssetId, PricesByAsset, PricePoint } from "./types";

// Simple Coingecko daily close fetcher (free). For production, consider caching and retries.
// Coingecko: /coins/{id}/market_chart?vs_currency=usd&days=max

async function fetchCoingeckoDailyPrices(
  assetId: AssetId,
  from: Date,
  to: Date,
  apiKey?: string
): Promise<PricePoint[]> {
  const key = apiKey || process.env.COINGECKO_API_KEY;
  const base = key ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const url = `${base}/coins/${assetId}/market_chart?vs_currency=usd&days=max`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-pro-api-key"] = key;

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
    polkadot: "DOTUSDT",
    aave: "AAVEUSDT",
    chainlink: "LINKUSDT",
    pepe: "PEPEUSDT",
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
      number,
      string,
      string,
      string,
      string,
      string,
      number,
      string,
      number,
      string,
      string,
      string
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
    pepe: "pepe-pepe",
    polkadot: "dot-polkadot",
    aave: "aave-aave",
    chainlink: "link-chainlink",
    fartcoin: "fart-fartcoin",
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
  end: string,
  opts?: { coingeckoApiKey?: string }
): Promise<PricesByAsset> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const unique = Array.from(new Set(assetIds)).filter(Boolean);
  const apiKey = opts?.coingeckoApiKey;

  const results = await Promise.all(
    unique.map(async (id) => {
      // Try CoinGecko (with or without key)
      try {
        const cg = await fetchCoingeckoDailyPrices(id, startDate, endDate, apiKey);
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
      try {
        const paprika = await fetchCoinPaprikaDailyPrices(id, startDate, endDate);
        return paprika;
      } catch {
        // If all providers fail, return empty series to avoid crashing the whole request
        return [];
      }
    })
  );

  const out: PricesByAsset = {};
  unique.forEach((id, i) => (out[id] = results[i]));
  return out;
}

export async function fetchCoinLogos(ids: AssetId[], apiKey?: string): Promise<Record<string, string>> {
  const key = apiKey || process.env.COINGECKO_API_KEY;
  const base = key ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-pro-api-key"] = key;
  const res: Record<string, string> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`${base}/coins/${id}`, { headers, cache: "force-cache" });
        if (!r.ok) return;
        const data = await r.json();
        const url = data?.image?.small || data?.image?.thumb;
        if (url) res[id] = url;
      } catch {}
    })
  );
  return res;
}

export async function fetchCurrentPricesUSD(ids: AssetId[], apiKey?: string): Promise<Record<string, number>> {
  const key = apiKey || process.env.COINGECKO_API_KEY;
  const base = key ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-pro-api-key"] = key;
  const result: Record<string, number> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`${base}/simple/price?ids=${id}&vs_currencies=usd`, { headers, cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        const usd = Number(data?.[id]?.usd);
        if (Number.isFinite(usd)) result[id] = usd;
      } catch {}
    })
  );
  return result;
}


