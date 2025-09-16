import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AssetId } from "@/lib/types";

// Schema for the request body
const schema = z.object({
  assetIds: z.array(z.enum([
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
    "wrapped-staked-ether",
    "euro-coin",
  ]) as z.ZodType<AssetId>),
});

// Map AssetId to contract addresses on Base network (for DeFi features only)
// Note: For backtesting, we use original asset symbols, not wrapped versions
const ASSET_ID_TO_CONTRACT_ADDRESS: Record<AssetId, string> = {
  bitcoin: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbBTC on Base (for DeFi only)
  ethereum: "0x4200000000000000000000000000000000000006", // WETH on Base (for DeFi only)
  solana: "0x0000000000000000000000000000000000000000", // Not available on Base
  "usd-coin": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  tether: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // USDT on Base
  pepe: "0x0000000000000000000000000000000000000000", // Not available on Base
  polkadot: "0x0000000000000000000000000000000000000000", // Not available on Base
  aave: "0x0000000000000000000000000000000000000000", // Not available on Base
  chainlink: "0x0000000000000000000000000000000000000000", // Not available on Base
  fartcoin: "0x0000000000000000000000000000000000000000", // Not available on Base
  "wrapped-staked-ether": "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", // wstETH on Base
  "euro-coin": "0x0000000000000000000000000000000000000000", // Not available on Base
};

// Fallback logos for assets not available on Base or when metadata fails
const FALLBACK_LOGOS: Record<AssetId, string> = {
  bitcoin: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  ethereum: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  solana: "https://assets.coingecko.com/coins/images/4128/large/solana.png",
  "usd-coin": "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png",
  tether: "https://assets.coingecko.com/coins/images/325/large/Tether.png",
  pepe: "https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg",
  polkadot: "https://assets.coingecko.com/coins/images/12171/large/polkadot.png",
  aave: "https://assets.coingecko.com/coins/images/12645/large/AAVE.png",
  chainlink: "https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  fartcoin: "https://assets.coingecko.com/coins/images/29850/large/pepe-token.jpeg", // Using PEPE as fallback
  "wrapped-staked-ether": "https://assets.coingecko.com/coins/images/18834/large/wstETH.png",
  "euro-coin": "https://assets.coingecko.com/coins/images/26045/large/euro-coin.png",
};

// Get Alchemy API key from server environment
function getAlchemyApiKey(): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error("ALCHEMY_API_KEY environment variable is required on the server");
  }
  return apiKey;
}

// Simple cache for logos to avoid repeated API calls
const logoCache = new Map<string, string>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Fetch token logo using Alchemy API with caching
async function fetchTokenLogo(assetId: AssetId): Promise<string> {
  // Check cache first
  const cacheKey = `logo_${assetId}`;
  const cached = logoCache.get(cacheKey);
  if (cached) {
    console.log(`Using cached logo for ${assetId}`);
    return cached;
  }

  const contractAddress = ASSET_ID_TO_CONTRACT_ADDRESS[assetId];
  
  // If no contract address available, use fallback logo
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    console.log(`Using fallback logo for ${assetId} (no contract address)`);
    const fallbackLogo = FALLBACK_LOGOS[assetId];
    logoCache.set(cacheKey, fallbackLogo);
    return fallbackLogo;
  }

  const apiKey = getAlchemyApiKey();
  const url = `https://base-mainnet.g.alchemy.com/v2/${apiKey}`;
  
  const payload = {
    jsonrpc: "2.0",
    method: "alchemy_getTokenMetadata",
    params: [contractAddress],
    id: 1
  };

  try {
    console.log(`Fetching token metadata for ${assetId} (${contractAddress})`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Alchemy API error for ${assetId}: ${response.status} - ${errorText}`);
      const fallbackLogo = FALLBACK_LOGOS[assetId];
      logoCache.set(cacheKey, fallbackLogo);
      return fallbackLogo;
    }

    const data = await response.json();
    
    if (data.error) {
      console.error(`Alchemy API error for ${assetId}: ${data.error.message || 'Unknown error'}`);
      const fallbackLogo = FALLBACK_LOGOS[assetId];
      logoCache.set(cacheKey, fallbackLogo);
      return fallbackLogo;
    }

    if (data.result && data.result.logo) {
      console.log(`Successfully fetched logo for ${assetId}: ${data.result.logo}`);
      logoCache.set(cacheKey, data.result.logo);
      return data.result.logo;
    } else {
      console.warn(`No logo in metadata response for ${assetId}, using fallback`);
      const fallbackLogo = FALLBACK_LOGOS[assetId];
      logoCache.set(cacheKey, fallbackLogo);
      return fallbackLogo;
    }
    
  } catch (error) {
    console.error(`Failed to fetch token metadata for ${assetId}:`, error);
    const fallbackLogo = FALLBACK_LOGOS[assetId];
    logoCache.set(cacheKey, fallbackLogo);
    return fallbackLogo;
  }
}

// Fetch token logos for multiple tokens with aggressive rate limiting
async function fetchTokenLogosBatch(assetIds: AssetId[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  
  // Process assets sequentially with longer delays to respect rate limits
  for (const assetId of assetIds) {
    try {
      const logo = await fetchTokenLogo(assetId);
      result[assetId] = logo;
      
      // Longer delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Failed to fetch logo for ${assetId}:`, error);
      result[assetId] = FALLBACK_LOGOS[assetId];
    }
  }
  
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);

    console.log('Token logos batch API request:', {
      assetIds: parsed.assetIds
    });

    const logos = await fetchTokenLogosBatch(parsed.assetIds);
    
    console.log(`Successfully fetched logos for ${Object.keys(logos).length} assets`);
    
    return NextResponse.json(logos);
  } catch (error) {
    console.error('Token logos batch API error:', error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
