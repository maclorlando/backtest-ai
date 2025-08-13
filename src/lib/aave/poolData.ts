import { Address, PublicClient, createPublicClient, http } from "viem";
import { sepolia, arbitrumSepolia, baseSepolia } from "viem/chains";
import { getAaveConfig } from "./config";
import { getRpcEndpoint, isRealPoolDataEnabled, isPriceOracleEnabled } from "@/lib/config/env";
import { getFallbackPriceByAddress } from "./priceFallback";
import { fetchMarketReserves, getMarketAddressForChain } from "./marketData";
import type { AavePoolInfo } from "@/lib/types";

// Aave Pool Data Provider ABI for fetching reserve data
const POOL_DATA_PROVIDER_ABI = [
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getReserveData",
    outputs: [
      { internalType: "uint256", name: "configuration", type: "uint256" },
      { internalType: "uint128", name: "liquidityIndex", type: "uint128" },
      { internalType: "uint128", name: "variableBorrowIndex", type: "uint128" },
      { internalType: "uint128", name: "currentLiquidityRate", type: "uint128" },
      { internalType: "uint128", name: "currentVariableBorrowRate", type: "uint128" },
      { internalType: "uint128", name: "currentStableBorrowRate", type: "uint128" },
      { internalType: "uint40", name: "lastUpdateTimestamp", type: "uint40" },
      { internalType: "uint16", name: "id", type: "uint16" },
      { internalType: "address", name: "aTokenAddress", type: "address" },
      { internalType: "address", name: "stableDebtTokenAddress", type: "address" },
      { internalType: "address", name: "variableDebtTokenAddress", type: "address" },
      { internalType: "address", name: "interestRateStrategyAddress", type: "address" },
      { internalType: "uint8", name: "usageAsCollateralEnabled", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllReservesTokens",
    outputs: [
      {
        components: [
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "address", name: "tokenAddress", type: "address" },
        ],
        internalType: "struct IPoolDataProvider.TokenData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aave Price Oracle ABI
const PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getAssetPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aave AToken ABI for total supply
const A_TOKEN_ABI = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Aave Variable Debt Token ABI for total borrow
const VARIABLE_DEBT_TOKEN_ABI = [
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Chain configuration for RPC endpoints
const CHAIN_CONFIG: Record<number, { rpc: string; name: string }> = {
  [sepolia.id]: {
    rpc: "https://eth-sepolia.g.alchemy.com/v2/demo",
    name: "Sepolia",
  },
  [arbitrumSepolia.id]: {
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    name: "Arbitrum Sepolia",
  },
  [baseSepolia.id]: {
    rpc: "https://sepolia.base.org",
    name: "Base Sepolia",
  },
};

/**
 * Fetch real pool information for a specific asset on Aave
 */
export async function fetchRealPoolInfo(
  chainId: number,
  assetAddress: Address,
  symbol: string
): Promise<AavePoolInfo> {
  try {
    // Check if real pool data is enabled
    if (!isRealPoolDataEnabled()) {
      console.log(`Real pool data disabled, using mock data for ${symbol}`);
      return getMockPoolInfo(symbol, assetAddress);
    }

    console.log(`Fetching real pool info for ${symbol} on chain ${chainId}`);
    
    // Get the market address for this chain
    const marketAddress = getMarketAddressForChain(chainId);
    if (!marketAddress) {
      throw new Error(`No market address found for chain ${chainId}`);
    }

    // Fetch all reserves for this market
    const reserves = await fetchMarketReserves(marketAddress, chainId);
    
    // Find the specific reserve for this asset
    const reserve = reserves.find(r => 
      r.address.toLowerCase() === assetAddress.toLowerCase() || 
      r.symbol === symbol
    );

    if (reserve) {
      console.log(`Found real pool info for ${symbol}:`, reserve);
      return reserve;
    } else {
      console.log(`Asset ${symbol} not found in market reserves, using fallback`);
      return getMockPoolInfo(symbol, assetAddress);
    }

  } catch (error) {
    console.error(`Failed to fetch real pool info for ${symbol} on chain ${chainId}:`, error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("market") || error.message.includes("reserve")) {
        console.error(`Market data error for ${symbol}. This might indicate:`);
        console.error(`- Asset ${symbol} (${assetAddress}) is not listed on this Aave market`);
        console.error(`- Network ${chainId} might not have this asset available`);
        console.error(`- Market address might be incorrect for this network`);
      } else if (error.message.includes("timeout")) {
        console.error(`Request timeout for ${symbol}. Network might be congested.`);
      } else if (error.message.includes("network")) {
        console.error(`Network error for ${symbol}. Please check your internet connection.`);
      }
    }
    
    console.log(`Falling back to mock data for ${symbol}`);
    return getMockPoolInfo(symbol, assetAddress); // Fallback to mock data
  }
}

/**
 * Fetch real asset price from Aave's price oracle
 */
export async function fetchAssetPrice(
  chainId: number,
  assetAddress: Address
): Promise<number> {
  try {
    // Check if price oracle is enabled
    if (!isPriceOracleEnabled()) {
      console.log(`Price oracle disabled, using fallback price for ${assetAddress}`);
      return 1.0;
    }

    const config = getAaveConfig(chainId);
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainId}`);
    }

    const chainConfig = CHAIN_CONFIG[chainId];
    if (!chainConfig) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // Use custom RPC endpoint if configured, otherwise use default
    const rpcUrl = getRpcEndpoint(chainId) || chainConfig.rpc;

    const publicClient = createPublicClient({
      chain: chainId === sepolia.id ? sepolia : 
             chainId === arbitrumSepolia.id ? arbitrumSepolia : 
             chainId === baseSepolia.id ? baseSepolia : sepolia,
      transport: http(rpcUrl, {
        timeout: 10000,
        retryCount: 3,
        retryDelay: 1000,
      }),
    });

    // Get asset price directly from price oracle
    const assetPrice = await publicClient.readContract({
      address: config.priceOracle as Address,
      abi: PRICE_ORACLE_ABI,
      functionName: "getAssetPrice",
      args: [assetAddress],
    });

    return Number(assetPrice) / 1e8; // Convert from 8 decimals to USD
  } catch (error) {
    console.error(`Failed to fetch asset price for ${assetAddress} on chain ${chainId}:`, error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes("ContractFunctionExecutionError")) {
        console.error(`Price oracle call reverted for ${assetAddress}. This might indicate:`);
        console.error(`- Asset ${assetAddress} is not listed on this Aave pool`);
        console.error(`- Price oracle might not have data for this asset`);
      } else if (error.message.includes("timeout")) {
        console.error(`RPC timeout for price fetch. Network might be congested.`);
      }
    }
    
    console.log(`Using fallback price for ${assetAddress}`);
    return getFallbackPriceByAddress(assetAddress); // Use fallback price service
  }
}

/**
 * Get mock pool info for fallback
 */
function getMockPoolInfo(symbol: string, assetAddress: Address): AavePoolInfo {
  const fallbackPrice = getFallbackPriceByAddress(assetAddress);
  return {
    symbol,
    address: assetAddress,
    totalSupply: "1000000.00",
    totalBorrow: "500000.00",
    supplyAPY: 2.5,
    borrowAPY: 4.2,
    utilizationRate: 50.0,
    liquidity: "500000.00",
    price: fallbackPrice,
  };
}

/**
 * Get supported networks for Aave
 */
export function getSupportedNetworks() {
  return Object.keys(CHAIN_CONFIG).map(Number);
}

/**
 * Fetch all pool data for a specific market
 */
export async function fetchAllPoolData(chainId: number): Promise<AavePoolInfo[]> {
  try {
    console.log(`Fetching all pool data for chain ${chainId}`);
    
    // Check if real pool data is enabled
    if (!isRealPoolDataEnabled()) {
      console.log(`Real pool data disabled, using mock data for chain ${chainId}`);
      return [];
    }

    // Get the market address for this chain
    const marketAddress = getMarketAddressForChain(chainId);
    if (!marketAddress) {
      throw new Error(`No market address found for chain ${chainId}`);
    }

    // Fetch all reserves for this market
    const reserves = await fetchMarketReserves(marketAddress, chainId);
    
    console.log(`Fetched ${reserves.length} reserves for chain ${chainId}`);
    return reserves;

  } catch (error) {
    console.error(`Failed to fetch all pool data for chain ${chainId}:`, error);
    throw error;
  }
}
