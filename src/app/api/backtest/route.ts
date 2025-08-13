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
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body) as BacktestRequest;

    const cgKey = req.headers.get("x-cg-key") || undefined;

    const prices = await fetchPrices(
      parsed.assets.map((a) => a.id),
      parsed.startDate,
      parsed.endDate,
      { coingeckoApiKey: cgKey }
    );

    const result = runBacktest(parsed, prices);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


