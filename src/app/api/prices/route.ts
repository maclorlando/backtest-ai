import { NextRequest, NextResponse } from "next/server";
import { fetchCurrentPricesUSD } from "@/lib/prices";
import type { AssetId } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, apiKey } = body;

    if (!ids || !Array.isArray(ids)) {
      return NextResponse.json({ error: "Invalid ids parameter" }, { status: 400 });
    }

    // Validate that all IDs are valid AssetId values
    const validAssetIds: AssetId[] = [
      "bitcoin", "ethereum", "solana", "usd-coin", "tether", 
      "pepe", "polkadot", "aave", "chainlink", "fartcoin"
    ];
    
    const validIds = ids.filter((id: string) => validAssetIds.includes(id as AssetId));
    
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid asset IDs provided" }, { status: 400 });
    }

    const prices = await fetchCurrentPricesUSD(validIds as AssetId[], apiKey);
    return NextResponse.json(prices);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
