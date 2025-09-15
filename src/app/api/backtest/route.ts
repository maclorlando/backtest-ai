import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchPrices } from "@/lib/prices";
import { runBacktest } from "@/lib/backtest";
import type { AssetId, BacktestRequest } from "@/lib/types";

const schema = z.object({
  assets: z
    .array(
      z.object({
        id: z.enum([
          "bitcoin",
          "ethereum",
          "solana",
          "usd-coin",
          "tether",
          "pepe",
          "polkadot",
          "aave",
          "chainlink",
          "fartcoin",
        ]) as z.ZodType<AssetId>,
        allocation: z.number().min(0).max(1),
      })
    )
    .min(1),
  startDate: z.string(),
  endDate: z.string(),
  rebalance: z.object({
    mode: z.enum(["none", "periodic", "threshold"]),
    periodDays: z.number().int().positive().optional(),
    thresholdPct: z.number().positive().optional(),
  }),
  initialCapital: z.number().positive().optional(),
  riskFreeRatePct: z.number().optional(),
  prices: z.record(z.string(), z.array(z.object({
    date: z.string(),
    price: z.number(),
  }))).optional(), // Pre-fetched prices from frontend
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body) as BacktestRequest & { prices?: Record<string, Array<{ date: string; price: number }>> };

    // Debug: Log the parsed request to verify allocations
    console.log('Backtest request received:', {
      assets: parsed.assets,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      rebalance: parsed.rebalance,
      initialCapital: parsed.initialCapital
    });

    // Use pre-fetched prices if available, otherwise fetch them
    let prices;
    if (parsed.prices) {
      console.log('Using pre-fetched prices from frontend');
      prices = parsed.prices;
    } else {
      console.log('Fetching prices from API (fallback)');
      const cgKey = req.headers.get("x-cg-key") || process.env.NEXT_PUBLIC_COINGECKO_API_KEY || undefined;
      prices = await fetchPrices(
        parsed.assets.map((a) => a.id),
        parsed.startDate,
        parsed.endDate,
        { coingeckoApiKey: cgKey }
      );
    }

    const result = runBacktest(parsed, prices);
    console.log('Backtest completed with result:', {
      finalValue: result.metrics.finalValue,
      cumulativeReturn: result.metrics.cumulativeReturnPct,
      assetCount: parsed.assets.length
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


