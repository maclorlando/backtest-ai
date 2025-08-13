import { aaveClient } from "./client";
import { market } from "@aave/client/actions";
import { chainId, evmAddress } from "@aave/client";
import type { AavePoolInfo } from "@/lib/types";

// Mock data for testing - this will be replaced with real API calls once we confirm the correct API
const MOCK_MARKET_DATA = {
  "1": { // Ethereum Mainnet
    name: "Aave V3 Ethereum",
    address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    reserves: [
      {
        symbol: "USDC",
        address: "0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8",
        totalSupply: "1000000000.00",
        totalBorrow: "500000000.00",
        supplyAPY: 2.5,
        borrowAPY: 4.2,
        utilizationRate: 50.0,
        liquidity: "500000000.00",
        price: 1.0,
      },
      {
        symbol: "WETH",
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        totalSupply: "50000.00",
        totalBorrow: "20000.00",
        supplyAPY: 1.8,
        borrowAPY: 3.5,
        utilizationRate: 40.0,
        liquidity: "30000.00",
        price: 3000.0,
      },
    ]
  }
};

/**
 * Fetch all available Aave markets for a specific chain
 */
export async function fetchAaveMarkets(targetChainId: number) {
  try {
    console.log(`Fetching Aave markets for chain ${targetChainId}`);
    
    // For now, skip the chains call since it's not working
    console.log("Using mock data for market fetching");
    
    // For now, return mock data for Ethereum mainnet
    if (targetChainId === 1) {
      return [MOCK_MARKET_DATA["1"]];
    }
    
    return [];
  } catch (error) {
    console.error(`Failed to fetch Aave markets for chain ${targetChainId}:`, error);
    throw error;
  }
}

/**
 * Fetch detailed market information including reserves
 */
export async function fetchAaveMarket(marketAddress: string, targetChainId: number) {
  try {
    console.log(`Fetching detailed market info for ${marketAddress} on chain ${targetChainId}`);
    
    // Use the real Aave SDK market action
    const result = await market(aaveClient, {
      address: evmAddress(marketAddress),
      chainId: chainId(targetChainId),
    });

    if (result.isErr()) {
      console.error("Market fetch error:", result.error);
      console.error("Error details:", JSON.stringify(result.error, null, 2));
      return null;
    }

    const marketData = result.value;
    if (!marketData) {
      console.log(`No market found for ${marketAddress} on chain ${targetChainId}`);
      console.log("This might mean:");
      console.log("1. The market address is incorrect");
      console.log("2. The market doesn't exist on this chain");
      console.log("3. The chain ID is not supported");
      return null;
    }

    console.log("Real market data fetched:", marketData);
    return marketData;
  } catch (error) {
    console.error(`Failed to fetch market ${marketAddress} on chain ${targetChainId}:`, error);
    throw error;
  }
}

/**
 * Convert Aave Reserve data to our AavePoolInfo format
 */
export function convertReserveToPoolInfo(reserve: any): AavePoolInfo {
  return {
    symbol: reserve.underlyingToken.symbol,
    address: reserve.underlyingToken.address,
    totalSupply: reserve.size.amount.value || "0",
    totalBorrow: reserve.borrowInfo?.totalBorrowed?.amount?.value || "0",
    supplyAPY: Number(reserve.supplyInfo.apy) || 0,
    borrowAPY: Number(reserve.borrowInfo?.apy) || 0,
    utilizationRate: Number(reserve.borrowInfo?.utilizationRate) || 0,
    liquidity: reserve.size.amount.value || "0",
    price: Number(reserve.usdExchangeRate) || 1.0,
  };
}

/**
 * Convert real Aave market data to our format
 */
export function convertMarketToPoolInfos(marketData: any): AavePoolInfo[] {
  const poolInfos: AavePoolInfo[] = [];
  
  console.log("Converting market data:", JSON.stringify(marketData, null, 2));
  
  // Process supply reserves
  if (marketData.supplyReserves) {
    for (const reserve of marketData.supplyReserves) {
      console.log("Processing supply reserve:", reserve);
      
      // Extract data with proper fallbacks
      const totalSupply = reserve.size?.amount?.value || reserve.totalSupply || "0";
      const totalBorrow = reserve.borrowInfo?.totalBorrowed?.amount?.value || "0";
      const supplyAPY = Number(reserve.supplyInfo?.apy || reserve.supplyAPY || 0);
      const borrowAPY = Number(reserve.borrowInfo?.apy || reserve.borrowAPY || 0);
      const utilizationRate = Number(reserve.borrowInfo?.utilizationRate || reserve.utilizationRate || 0);
      const price = Number(reserve.usdExchangeRate || reserve.price || 1.0);
      
      const poolInfo: AavePoolInfo = {
        symbol: reserve.underlyingToken?.symbol || reserve.symbol || "UNKNOWN",
        address: reserve.underlyingToken?.address || reserve.address || "0x0",
        totalSupply: totalSupply,
        totalBorrow: totalBorrow,
        supplyAPY: supplyAPY,
        borrowAPY: borrowAPY,
        utilizationRate: utilizationRate,
        liquidity: totalSupply,
        price: price,
      };
      
      console.log("Created pool info:", poolInfo);
      poolInfos.push(poolInfo);
    }
  }
  
  // Process borrow reserves (avoid duplicates)
  if (marketData.borrowReserves) {
    for (const reserve of marketData.borrowReserves) {
      const existingIndex = poolInfos.findIndex(p => p.address === (reserve.underlyingToken?.address || reserve.address));
      if (existingIndex === -1) {
        console.log("Processing borrow reserve:", reserve);
        
        const totalSupply = reserve.size?.amount?.value || reserve.totalSupply || "0";
        const totalBorrow = reserve.borrowInfo?.totalBorrowed?.amount?.value || "0";
        const supplyAPY = Number(reserve.supplyInfo?.apy || reserve.supplyAPY || 0);
        const borrowAPY = Number(reserve.borrowInfo?.apy || reserve.borrowAPY || 0);
        const utilizationRate = Number(reserve.borrowInfo?.utilizationRate || reserve.utilizationRate || 0);
        const price = Number(reserve.usdExchangeRate || reserve.price || 1.0);
        
        const poolInfo: AavePoolInfo = {
          symbol: reserve.underlyingToken?.symbol || reserve.symbol || "UNKNOWN",
          address: reserve.underlyingToken?.address || reserve.address || "0x0",
          totalSupply: totalSupply,
          totalBorrow: totalBorrow,
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate,
          liquidity: totalSupply,
          price: price,
        };
        
        console.log("Created pool info from borrow reserve:", poolInfo);
        poolInfos.push(poolInfo);
      }
    }
  }
  
  console.log(`Converted ${poolInfos.length} pool infos:`, poolInfos);
  return poolInfos;
}

/**
 * Fetch all reserves for a specific market and convert to our format
 */
export async function fetchMarketReserves(marketAddress: string, targetChainId: number): Promise<AavePoolInfo[]> {
  try {
    console.log(`Fetching reserves for market ${marketAddress} on chain ${targetChainId}`);
    
    const market = await fetchAaveMarket(marketAddress, targetChainId);
    
    if (!market) {
      console.log(`Market not found, falling back to mock data for chain ${targetChainId}`);
      
      // Fallback to mock data for Ethereum mainnet
      if (targetChainId === 1) {
        return MOCK_MARKET_DATA["1"].reserves as AavePoolInfo[];
      }
      
      throw new Error(`Market ${marketAddress} not found on chain ${targetChainId}`);
    }

    // Convert real market data to our format
    const poolInfos = convertMarketToPoolInfos(market);
    console.log(`Converted ${poolInfos.length} reserves from real market data`);
    return poolInfos;
  } catch (error) {
    console.error(`Failed to fetch reserves for market ${marketAddress} on chain ${targetChainId}:`, error);
    
    // Fallback to mock data for Ethereum mainnet
    if (targetChainId === 1) {
      console.log("Falling back to mock data for Ethereum mainnet");
      return MOCK_MARKET_DATA["1"].reserves as AavePoolInfo[];
    }
    
    throw error;
  }
}

/**
 * Get market address for a specific chain
 * Based on official Aave documentation: https://aave.com/docs/resources/addresses
 * Only mainnets supported for production use
 */
export function getMarketAddressForChain(targetChainId: number): string | null {
  // Known market addresses for mainnets only (Pool addresses)
  const marketAddresses: Record<number, string> = {
    1: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // Ethereum V3
    8453: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5", // Base V3
    137: "0x794a61358d6845594f94dc1db02a252b5b4814ad", // Polygon V3
    42161: "0x794a61358d6845594f94dc1db02a252b5b4814ad", // Arbitrum V3
    10: "0x794a61358d6845594f94dc1db02a252b5b4814ad", // Optimism V3
    43114: "0x794a61358d6845594f94dc1db02a252b5b4814ad", // Avalanche V3
  };

  return marketAddresses[targetChainId] || null;
}

/**
 * Fetch all available markets and their basic info
 */
export async function getAllMarkets() {
  try {
    console.log("Fetching all available Aave markets...");
    
    // For now, return mock data for Ethereum mainnet
    return [MOCK_MARKET_DATA["1"]];
  } catch (error) {
    console.error("Failed to fetch all markets:", error);
    throw error;
  }
}
