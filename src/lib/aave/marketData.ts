import { aaveClient } from "./client";
import { market } from "@aave/client/actions";
import { chainId, evmAddress } from "@aave/client";
import type { AavePoolInfo } from "@/lib/types";
import { createPublicClient, http, Address } from "viem";
import { mainnet, base, arbitrum } from "viem/chains";
import { DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig } from "./config";
import { showErrorNotification, showInfoNotification } from "@/lib/utils/errorHandling";

// Rate limiting utility
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 10, timeWindow: number = 1000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(now);
  }
}

// Create rate limiters for different RPC endpoints
const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(rpcUrl: string): RateLimiter {
  if (!rateLimiters.has(rpcUrl)) {
    // More conservative rate limiting for public RPCs
    const isPublicRPC = rpcUrl.includes('llamarpc.com') || rpcUrl.includes('alchemy.com') || rpcUrl.includes('infura.io');
    const maxRequests = isPublicRPC ? 5 : 10; // 5 requests per second for public RPCs
    const timeWindow = isPublicRPC ? 1000 : 1000; // 1 second window
    rateLimiters.set(rpcUrl, new RateLimiter(maxRequests, timeWindow));
  }
  return rateLimiters.get(rpcUrl)!;
}

// Aave V3 Protocol Data Provider ABI (correct ABI for the contract we're calling)
const PROTOCOL_DATA_PROVIDER_ABI = [
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

const PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: "address", name: "asset", type: "address" }],
    name: "getAssetPrice",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Get Aave addresses from the official address book
function getAaveAddresses(chainId: number) {
  const config = getAaveConfig(chainId);
  if (!config) {
    return null;
  }
  
  return {
    pool: config.pool,
    aaveProtocolDataProvider: config.aaveProtocolDataProvider,
    priceOracle: config.priceOracle,
    chain: chainId === 1 ? mainnet : chainId === 8453 ? base : chainId === 42161 ? arbitrum : mainnet,
    hasDataProvider: true // All chains with config have data providers
  };
}

// Mock data for testing - this will be replaced with real API calls once we confirm the correct API
const MOCK_MARKET_DATA = {
  "1": { // Ethereum Mainnet
    name: "Aave V3 Ethereum",
    address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    reserves: [
      {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
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
      {
        symbol: "AAVE",
        address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        totalSupply: "6238.160150512429752511",
        totalBorrow: "1247.632030102485950502",
        supplyAPY: 1.2,
        borrowAPY: 3.8,
        utilizationRate: 20.0,
        liquidity: "4990.528120409943802009",
        price: 328.42,
      },
      {
        symbol: "EURC",
        address: "0x1aBaEA1f7C830bD89Acc67eC4d516149a1bF7E50",
        totalSupply: "22647802.407463",
        totalBorrow: "4529560.4814926",
        supplyAPY: 0.8,
        borrowAPY: 2.5,
        utilizationRate: 20.0,
        liquidity: "18118241.9259704",
        price: 1.17,
      },
      {
        symbol: "GHO",
        address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
        totalSupply: "17429222.389635913658802916",
        totalBorrow: "3485844.477927182731760583",
        supplyAPY: 0.5,
        borrowAPY: 2.0,
        utilizationRate: 20.0,
        liquidity: "13943377.911708730927042333",
        price: 1.0,
      },
    ]
  },
  "8453": { // Base Mainnet
    name: "Aave V3 Base",
    address: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
    reserves: [
      {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        totalSupply: "500000000.00",
        totalBorrow: "200000000.00",
        supplyAPY: 4.3,
        borrowAPY: 5.8,
        utilizationRate: 40.0,
        liquidity: "300000000.00",
        price: 1.0,
      },
      {
        symbol: "cbBTC",
        address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        totalSupply: "1500.00",
        totalBorrow: "600.00",
        supplyAPY: 2.5,
        borrowAPY: 3.9,
        utilizationRate: 40.0,
        liquidity: "900.00",
        price: 65000.0,
      },
      {
        symbol: "WETH",
        address: "0x4200000000000000000000000000000000000006",
        totalSupply: "25000.00",
        totalBorrow: "10000.00",
        supplyAPY: 2.8,
        borrowAPY: 4.2,
        utilizationRate: 40.0,
        liquidity: "15000.00",
        price: 3000.0,
      },
      {
        symbol: "wstETH",
        address: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
        totalSupply: "12000.00",
        totalBorrow: "4800.00",
        supplyAPY: 3.2,
        borrowAPY: 4.5,
        utilizationRate: 40.0,
        liquidity: "7200.00",
        price: 3200.0,
      },
      {
        symbol: "EURC",
        address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
        totalSupply: "50000000.00",
        totalBorrow: "20000000.00",
        supplyAPY: 2.1,
        borrowAPY: 3.8,
        utilizationRate: 40.0,
        liquidity: "30000000.00",
        price: 1.17,
      },
      {
        symbol: "AAVE",
        address: "0x63706e401c06ac8513145b7687A14804d17f814b",
        totalSupply: "50000.00",
        totalBorrow: "20000.00",
        supplyAPY: 1.8,
        borrowAPY: 3.5,
        utilizationRate: 40.0,
        liquidity: "30000.00",
        price: 328.42,
      },
    ]
  },
  "42161": { // Arbitrum Mainnet
    name: "Aave V3 Arbitrum",
    address: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
    reserves: [
      {
        symbol: "USDC",
        address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        totalSupply: "800000000.00",
        totalBorrow: "400000000.00",
        supplyAPY: 2.3,
        borrowAPY: 4.0,
        utilizationRate: 50.0,
        liquidity: "400000000.00",
        price: 1.0,
      },
      {
        symbol: "WETH",
        address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        totalSupply: "40000.00",
        totalBorrow: "15000.00",
        supplyAPY: 1.9,
        borrowAPY: 3.6,
        utilizationRate: 37.5,
        liquidity: "25000.00",
        price: 3000.0,
      },
      {
        symbol: "USDT",
        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        totalSupply: "600000000.00",
        totalBorrow: "300000000.00",
        supplyAPY: 2.1,
        borrowAPY: 3.8,
        utilizationRate: 50.0,
        liquidity: "300000000.00",
        price: 1.0,
      },
      {
        symbol: "WBTC",
        address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
        totalSupply: "2000.00",
        totalBorrow: "800.00",
        supplyAPY: 1.5,
        borrowAPY: 3.2,
        utilizationRate: 40.0,
        liquidity: "1200.00",
        price: 45000.0,
      },
      {
        symbol: "LINK",
        address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
        totalSupply: "500000.00",
        totalBorrow: "200000.00",
        supplyAPY: 1.7,
        borrowAPY: 3.4,
        utilizationRate: 40.0,
        liquidity: "300000.00",
        price: 15.0,
      },
    ]
  }
};

/**
 * Fetch real Aave V3 market data using the official data providers
 */
export async function fetchRealAaveMarketData(targetChainId: number): Promise<AavePoolInfo[]> {
  try {
    console.log(`Fetching real Aave V3 market data for chain ${targetChainId}`);
    
    // First, try GraphQL API for complete data
    console.log(`Trying GraphQL API for chain ${targetChainId}...`);
    const graphqlData = await fetchAaveDataWithGraphQL(targetChainId);
    if (graphqlData && graphqlData.length > 0) {
      console.log(`Successfully fetched ${graphqlData.length} reserves from GraphQL API`);
      return graphqlData;
    }
    
    // If GraphQL fails, try SDK first
    console.log(`GraphQL failed, trying SDK...`);
    try {
      const addresses = getAaveAddresses(targetChainId);
      if (addresses) {
        const sdkData = await fetchAaveDataWithSDK(targetChainId, addresses.pool);
        if (sdkData && sdkData.length > 0) {
          console.log(`Successfully fetched ${sdkData.length} reserves using SDK`);
          return sdkData;
        }
      }
    } catch (sdkError) {
      console.log("SDK fetch failed:", sdkError);
      showErrorNotification(sdkError, "Aave SDK Error");
    }
    
    // If GraphQL fails, try direct contract calls
    console.log(`GraphQL failed, trying direct contract calls...`);
    
    const addresses = getAaveAddresses(targetChainId);
    if (!addresses) {
      console.log(`No Aave V3 addresses found for chain ${targetChainId}`);
      return [];
    }

    // Check if this chain has a dedicated data provider
    if (!addresses.hasDataProvider) {
      console.log(`Chain ${targetChainId} doesn't have a dedicated UI Pool Data Provider, using mock data`);
      return getMockPoolDataForChain(targetChainId);
    }

    console.log(`Using addresses for chain ${targetChainId}:`, {
      pool: addresses.pool,
      aaveProtocolDataProvider: addresses.aaveProtocolDataProvider,
      priceOracle: addresses.priceOracle
    });

    // Get the RPC URL for this chain
    const rpcUrl = DEFAULT_RPC_BY_CHAIN[targetChainId];
    if (!rpcUrl) {
      console.error(`No RPC URL found for chain ${targetChainId}`);
      throw new Error(`No RPC URL configured for chain ${targetChainId}`);
    }

    console.log(`Using RPC URL for chain ${targetChainId}: ${rpcUrl}`);

    // Get rate limiter for this RPC
    const rateLimiter = getRateLimiter(rpcUrl);

    // Create public client for the chain with proper RPC configuration
    const publicClient = createPublicClient({
      chain: addresses.chain,
      transport: http(rpcUrl, {
        timeout: 30000, // 30 second timeout
        retryCount: 3,
        retryDelay: 1000,
      })
    });

    console.log(`Created public client for chain ${targetChainId}`);

    // Wait for rate limit slot before making requests
    await rateLimiter.waitForSlot();

    // First, get all reserve tokens
    console.log(`Fetching all reserve tokens from ${addresses.aaveProtocolDataProvider}...`);
    const reserveTokens = await publicClient.readContract({
      address: addresses.aaveProtocolDataProvider as Address,
      abi: PROTOCOL_DATA_PROVIDER_ABI,
      functionName: "getAllReservesTokens",
      args: []
    });

    console.log(`Successfully fetched ${reserveTokens.length} reserve tokens from Protocol Data Provider`);

    // Limit the number of tokens we process to avoid rate limiting
    const maxTokensToProcess = 10; // Process only first 10 tokens to avoid rate limits
    const tokensToProcess = reserveTokens.slice(0, maxTokensToProcess);
    
    console.log(`Processing ${tokensToProcess.length} tokens (limited to avoid rate limits)`);

    const poolInfos: AavePoolInfo[] = [];

    // Process tokens with rate limiting
    for (let i = 0; i < tokensToProcess.length; i++) {
      const token = tokensToProcess[i];
      
      try {
        console.log(`Processing reserve ${i + 1}/${tokensToProcess.length}: ${token.symbol} (${token.tokenAddress})`);
        
        // Wait for rate limit slot before each request
        await rateLimiter.waitForSlot();
        
        // Get detailed reserve data for this token
        const reserveData = await publicClient.readContract({
          address: addresses.aaveProtocolDataProvider as Address,
          abi: PROTOCOL_DATA_PROVIDER_ABI,
          functionName: "getReserveData",
          args: [token.tokenAddress]
        });

        // Wait for rate limit slot before price request
        await rateLimiter.waitForSlot();
        
        // Get asset price from price oracle
        console.log(`Fetching price for ${token.symbol} from ${addresses.priceOracle}...`);
        const priceData = await publicClient.readContract({
          address: addresses.priceOracle as Address,
          abi: PRICE_ORACLE_ABI,
          functionName: "getAssetPrice",
          args: [token.tokenAddress]
        });

        const price = Number(priceData) / 1e8; // Convert from 8 decimals
        console.log(`Price for ${token.symbol}: $${price}`);

        // Calculate APY from rates (rates are in RAY units, 1e27)
        const supplyAPY = (Number(reserveData[3]) / 1e27) * 100;
        const borrowAPY = (Number(reserveData[4]) / 1e27) * 100;

        // For now, use simplified calculations since we don't have total supply/borrow
        // We'll use the liquidity and variable borrow indices as proxies
        const totalSupply = Number(reserveData[1]) / 1e27;
        const totalBorrow = Number(reserveData[2]) / 1e27;
        const utilizationRate = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0;

        console.log(`Calculated values for ${token.symbol}:`, {
          supplyAPY,
          borrowAPY,
          totalSupply,
          totalBorrow,
          utilizationRate
        });

        const poolInfo: AavePoolInfo = {
          symbol: token.symbol,
          address: token.tokenAddress,
          totalSupply: totalSupply.toFixed(2),
          totalBorrow: totalBorrow.toFixed(2),
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate,
          liquidity: (totalSupply - totalBorrow).toFixed(2),
          price: price,
        };

        console.log(`Processed reserve ${token.symbol}:`, poolInfo);
        poolInfos.push(poolInfo);

        // Add a small delay between tokens to be extra safe
        if (i < tokensToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error) {
        console.warn(`Failed to process reserve ${token.symbol}:`, error);
      }
    }

    if (poolInfos.length > 0) {
      console.log(`Successfully fetched ${poolInfos.length} reserves from Aave V3`);
      return poolInfos;
    }

    // If no data was fetched from contract calls, fall back to mock data
    console.log(`No data fetched from Protocol Data Provider, using mock data...`);
    return getMockPoolDataForChain(targetChainId);

  } catch (error) {
    console.error(`Failed to fetch real Aave V3 market data for chain ${targetChainId}:`, error);
    
    // Show user-friendly error notification
    showErrorNotification(error, "Aave Data Fetch Error");
    
    // Provide more detailed error information
    if (error instanceof Error) {
      if (error.message.includes("ContractFunctionExecutionError")) {
        console.error(`Contract call reverted. This might indicate:`);
        console.error(`- Data provider address is incorrect for chain ${targetChainId}`);
        console.error(`- Pool address is incorrect for chain ${targetChainId}`);
        console.error(`- Chain ${targetChainId} might not be supported by the data provider`);
      } else if (error.message.includes("timeout")) {
        console.error(`RPC timeout. Network might be congested.`);
      } else if (error.message.includes("network")) {
        console.error(`Network error. Please check your internet connection.`);
      } else if (error.message.includes("429")) {
        console.error(`Rate limit exceeded. Consider using a different RPC endpoint.`);
      }
    }
    
    // Final fallback to mock data for supported networks
    console.log(`Falling back to mock data for chain ${targetChainId}`);
    showInfoNotification("Using fallback data for Aave markets", "Fallback Data");
    return getMockPoolDataForChain(targetChainId);
  }
}

/**
 * Fetch Aave data using the official SDK as a fallback
 */
async function fetchAaveDataWithSDK(targetChainId: number, poolAddress: string): Promise<AavePoolInfo[]> {
  try {
    console.log(`Fetching Aave data with SDK for chain ${targetChainId}, pool ${poolAddress}`);
    
    const result = await market(aaveClient, {
      address: evmAddress(poolAddress),
      chainId: chainId(targetChainId),
    });

    if (result.isErr()) {
      console.error("SDK market fetch error:", result.error);
      return [];
    }

    const marketData = result.value;
    if (!marketData) {
      console.log(`No market data found for pool ${poolAddress} on chain ${targetChainId}`);
      return [];
    }

    console.log("SDK market data fetched:", marketData);
    
    // Convert SDK data to our format
    return convertMarketToPoolInfos(marketData);
    
  } catch (error) {
    console.error(`SDK fetch failed for chain ${targetChainId}:`, error);
    return [];
  }
}

/**
 * Get mock pool data for a specific chain
 */
export function getMockPoolDataForChain(targetChainId: number): AavePoolInfo[] {
  if (MOCK_MARKET_DATA[targetChainId.toString() as keyof typeof MOCK_MARKET_DATA]) {
    const mockReserves = MOCK_MARKET_DATA[targetChainId.toString() as keyof typeof MOCK_MARKET_DATA].reserves;
    console.log(`Using mock data for chain ${targetChainId}:`, mockReserves);
    
    // Ensure mock data is properly formatted as AavePoolInfo
    const formattedReserves = mockReserves.map((reserve: Record<string, unknown>) => ({
      symbol: reserve.symbol,
      address: reserve.address,
      totalSupply: reserve.totalSupply,
      totalBorrow: reserve.totalBorrow,
      supplyAPY: Number(reserve.supplyAPY) || 0,
      borrowAPY: Number(reserve.borrowAPY) || 0,
      utilizationRate: Number(reserve.utilizationRate) || 0,
      liquidity: reserve.liquidity,
      price: Number(reserve.price) || 1.0,
    }));
    
    console.log(`Formatted mock reserves for chain ${targetChainId}:`, formattedReserves);
    return formattedReserves as AavePoolInfo[];
  }
  
  console.log(`No mock data available for chain ${targetChainId}`);
  return [];
}

/**
 * Fetch all available Aave markets for a specific chain
 */
export async function fetchAaveMarkets(targetChainId: number) {
  try {
    console.log(`Fetching Aave markets for chain ${targetChainId}`);
    
    // For now, skip the chains call since it's not working
    console.log("Using mock data for market fetching");
    
    // Return mock data for supported networks
    if (MOCK_MARKET_DATA[targetChainId.toString() as keyof typeof MOCK_MARKET_DATA]) {
      return [MOCK_MARKET_DATA[targetChainId.toString() as keyof typeof MOCK_MARKET_DATA]];
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
export function convertReserveToPoolInfo(reserve: Record<string, unknown>): AavePoolInfo {
  const underlyingToken = reserve.underlyingToken as Record<string, unknown>;
  const size = reserve.size as Record<string, unknown>;
  const amount = size.amount as Record<string, unknown>;
  const borrowInfo = reserve.borrowInfo as Record<string, unknown> | undefined;
  const totalBorrowed = borrowInfo?.totalBorrowed as Record<string, unknown> | undefined;
  const borrowedAmount = totalBorrowed?.amount as Record<string, unknown> | undefined;
  
  return {
    symbol: underlyingToken.symbol as string,
    address: underlyingToken.address as string,
    totalSupply: (amount.value as string) || "0",
    totalBorrow: (borrowedAmount?.value as string) || "0",
    supplyAPY: Number((reserve.supplyInfo as Record<string, unknown>)?.apy) || 0,
    borrowAPY: Number(borrowInfo?.apy) || 0,
    utilizationRate: Number(borrowInfo?.utilizationRate) || 0,
    liquidity: (amount.value as string) || "0",
    price: Number(reserve.usdExchangeRate) || 1.0,
  };
}

/**
 * Convert real Aave market data to our format
 */
export function convertMarketToPoolInfos(marketData: Record<string, unknown>): AavePoolInfo[] {
  const poolInfos: AavePoolInfo[] = [];
  
  console.log("Converting market data:", JSON.stringify(marketData, null, 2));
  
  // Process supply reserves
  if (marketData.supplyReserves) {
    for (const reserve of (marketData.supplyReserves as Record<string, unknown>[])) {
      console.log("Processing supply reserve:", reserve);
      
      // Extract data with proper fallbacks and validation
      let totalSupply = "0";
      let totalBorrow = "0";
      
      // Extract total supply from nested structure
      const size = reserve.size as Record<string, unknown> | undefined;
      const amount = size?.amount as Record<string, unknown> | undefined;
      if (amount?.value) {
        totalSupply = String(amount.value);
      } else if (reserve.totalSupply) {
        totalSupply = String(reserve.totalSupply);
      } else if (reserve.size) {
        // Handle case where size is an object
        totalSupply = String(reserve.size);
      }
      
      // Extract total borrow from nested structure
      const borrowInfo = reserve.borrowInfo as Record<string, unknown> | undefined;
      const totalBorrowed = borrowInfo?.totalBorrowed as Record<string, unknown> | undefined;
      const borrowedAmount = totalBorrowed?.amount as Record<string, unknown> | undefined;
      
      if (borrowedAmount?.value) {
        totalBorrow = String(borrowedAmount.value);
      } else if (borrowInfo?.total) {
        totalBorrow = String(borrowInfo.total);
      } else if (totalBorrowed) {
        // Handle case where totalBorrowed is an object
        if (typeof totalBorrowed === 'object') {
          // Try to extract value from object
          if (totalBorrowed.value) {
            totalBorrow = String(totalBorrowed.value);
          } else if (totalBorrowed.amount) {
            totalBorrow = String(totalBorrowed.amount);
          } else {
            totalBorrow = "0";
          }
        } else {
          totalBorrow = String(totalBorrowed);
        }
      }
      
      // Handle APY values with proper validation
      let supplyAPY = 0;
      let borrowAPY = 0;
      
      try {
        // Extract APY from the complex nested structure returned by Aave SDK
        // The SDK returns APY in format: { formatted: "0.01", value: "0.0001", raw: "1000000000000000000000000" }
        let rawSupplyAPY = 0;
        let rawBorrowAPY = 0;
        
        // Try to get supply APY from the nested structure
        const supplyInfo = reserve.supplyInfo as Record<string, unknown> | undefined;
        const supplyApy = supplyInfo?.apy as Record<string, unknown> | undefined;
        
        if (supplyApy?.formatted) {
          rawSupplyAPY = parseFloat(supplyApy.formatted as string);
        } else if (supplyApy?.value) {
          rawSupplyAPY = parseFloat(supplyApy.value as string) * 100; // Convert decimal to percentage
        } else if (supplyApy) {
          rawSupplyAPY = typeof supplyApy === 'string' ? parseFloat(supplyApy) : Number(supplyApy);
        } else if (supplyInfo?.rate) {
          // Alternative field name
          rawSupplyAPY = typeof supplyInfo.rate === 'string' ? parseFloat(supplyInfo.rate as string) : Number(supplyInfo.rate);
        }
        
        // Try to get borrow APY from the nested structure
        const borrowApy = borrowInfo?.apy as Record<string, unknown> | undefined;
        
        if (borrowApy?.formatted) {
          rawBorrowAPY = parseFloat(borrowApy.formatted as string);
        } else if (borrowApy?.value) {
          rawBorrowAPY = parseFloat(borrowApy.value as string) * 100; // Convert decimal to percentage
        } else if (borrowApy) {
          rawBorrowAPY = typeof borrowApy === 'string' ? parseFloat(borrowApy) : Number(borrowApy);
        } else if (borrowInfo?.rate) {
          // Alternative field name
          rawBorrowAPY = typeof borrowInfo.rate === 'string' ? parseFloat(borrowInfo.rate as string) : Number(borrowInfo.rate);
        }
        
        // Convert to numbers and validate
        supplyAPY = typeof rawSupplyAPY === 'string' ? parseFloat(rawSupplyAPY) : Number(rawSupplyAPY);
        borrowAPY = typeof rawBorrowAPY === 'string' ? parseFloat(rawBorrowAPY) : Number(rawBorrowAPY);
        
        // Check for NaN and provide fallbacks
        if (isNaN(supplyAPY)) supplyAPY = 0;
        if (isNaN(borrowAPY)) borrowAPY = 0;
        
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.log(`APY extraction for ${underlyingToken?.symbol}:`, {
          supplyAPY,
          borrowAPY,
          supplyInfo: supplyInfo?.apy,
          borrowInfo: borrowInfo?.apy
        });
        
      } catch (error) {
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.warn(`Failed to parse APY values for ${underlyingToken?.symbol}:`, error);
        supplyAPY = 0;
        borrowAPY = 0;
      }
      
      // Handle utilization rate
      let utilizationRate = 0;
      try {
        // Extract utilization rate from the nested structure
        let rawUtilization = 0;
        const utilizationRateObj = borrowInfo?.utilizationRate as Record<string, unknown> | undefined;
        
        if (utilizationRateObj?.formatted) {
          rawUtilization = parseFloat(utilizationRateObj.formatted as string);
        } else if (utilizationRateObj?.value) {
          rawUtilization = parseFloat(utilizationRateObj.value as string) * 100; // Convert decimal to percentage
        } else if (borrowInfo?.utilizationRate) {
          rawUtilization = typeof borrowInfo.utilizationRate === 'string' ? parseFloat(borrowInfo.utilizationRate as string) : Number(borrowInfo.utilizationRate);
        } else if (reserve.utilizationRate) {
          rawUtilization = typeof reserve.utilizationRate === 'string' ? parseFloat(reserve.utilizationRate as string) : Number(reserve.utilizationRate);
        }
        
        utilizationRate = typeof rawUtilization === 'string' ? parseFloat(rawUtilization) : Number(rawUtilization);
        if (isNaN(utilizationRate)) utilizationRate = 0;
        
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.log(`Utilization rate for ${underlyingToken?.symbol}:`, {
          utilizationRate,
          rawUtilization,
          borrowInfo: borrowInfo?.utilizationRate
        });
      } catch (error) {
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.warn(`Failed to parse utilization rate for ${underlyingToken?.symbol}:`, error);
        utilizationRate = 0;
      }
      
      // Handle price
      let price = 1.0;
      try {
        // Extract price from nested structure
        let rawPrice = 1.0;
        if (reserve.usdExchangeRate) {
          rawPrice = reserve.usdExchangeRate as number;
        } else if (reserve.price) {
          rawPrice = reserve.price as number;
        } else if (size?.usdPerToken) {
          rawPrice = size.usdPerToken as number;
        }
        
        price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
        if (isNaN(price)) price = 1.0;
        
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.log(`Price for ${underlyingToken?.symbol}:`, {
          price,
          rawPrice,
          usdExchangeRate: reserve.usdExchangeRate,
          size: size?.usdPerToken
        });
      } catch (error) {
        const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
        console.warn(`Failed to parse price for ${underlyingToken?.symbol}:`, error);
        price = 1.0;
      }
      
              const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
              const poolInfo: AavePoolInfo = {
          symbol: (underlyingToken?.symbol as string) || (reserve.symbol as string) || "UNKNOWN",
          address: (underlyingToken?.address as string) || (reserve.address as string) || "0x0",
          totalSupply: String(totalSupply || "0"),
          totalBorrow: String(totalBorrow || "0"),
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate,
          liquidity: (parseFloat(String(totalSupply || "0")) - parseFloat(String(totalBorrow || "0"))).toFixed(2),
          price: price,
        };
      
      console.log("Created pool info:", poolInfo);
      poolInfos.push(poolInfo);
    }
  }
  
  // Process borrow reserves (avoid duplicates)
  if (marketData.borrowReserves) {
    for (const reserve of (marketData.borrowReserves as Record<string, unknown>[])) {
      const underlyingToken = reserve.underlyingToken as Record<string, unknown> | undefined;
      const existingIndex = poolInfos.findIndex(p => p.address === (underlyingToken?.address || reserve.address));
      if (existingIndex === -1) {
        console.log("Processing borrow reserve:", reserve);
        
        let totalSupply = "0";
        let totalBorrow = "0";
        
        // Extract total supply from nested structure
        const size = reserve.size as Record<string, unknown> | undefined;
        const amount = size?.amount as Record<string, unknown> | undefined;
        
        if (amount?.value) {
          totalSupply = String(amount.value);
        } else if (reserve.totalSupply) {
          totalSupply = String(reserve.totalSupply);
        } else if (reserve.size) {
          // Handle case where size is an object
          totalSupply = String(reserve.size);
        }
        
        // Extract total borrow from nested structure
        const borrowInfo = reserve.borrowInfo as Record<string, unknown> | undefined;
        const totalBorrowed = borrowInfo?.totalBorrowed as Record<string, unknown> | undefined;
        const borrowedAmount = totalBorrowed?.amount as Record<string, unknown> | undefined;
        
        if (borrowedAmount?.value) {
          totalBorrow = String(borrowedAmount.value);
        } else if (borrowInfo?.total) {
          totalBorrow = String(borrowInfo.total);
        } else if (totalBorrowed) {
          // Handle case where totalBorrowed is an object
          if (typeof totalBorrowed === 'object') {
            // Try to extract value from object
            if (totalBorrowed.value) {
              totalBorrow = String(totalBorrowed.value);
            } else if (totalBorrowed.amount) {
              totalBorrow = String(totalBorrowed.amount);
            } else {
              totalBorrow = "0";
            }
          } else {
            totalBorrow = String(totalBorrowed);
          }
        }
        
        // Handle APY values with proper validation
        let supplyAPY = 0;
        let borrowAPY = 0;
        
        try {
          // Extract APY from the complex nested structure returned by Aave SDK
          let rawSupplyAPY = 0;
          let rawBorrowAPY = 0;
          
          // Try to get supply APY from the nested structure
          const supplyInfo = reserve.supplyInfo as Record<string, unknown> | undefined;
          const supplyApy = supplyInfo?.apy as Record<string, unknown> | undefined;
          
          if (supplyApy?.formatted) {
            rawSupplyAPY = parseFloat(supplyApy.formatted as string);
          } else if (supplyApy?.value) {
            rawSupplyAPY = parseFloat(supplyApy.value as string) * 100; // Convert decimal to percentage
          } else if (supplyApy) {
            rawSupplyAPY = typeof supplyApy === 'string' ? parseFloat(supplyApy) : Number(supplyApy);
          } else if (supplyInfo?.rate) {
            // Alternative field name
            rawSupplyAPY = typeof supplyInfo.rate === 'string' ? parseFloat(supplyInfo.rate as string) : Number(supplyInfo.rate);
          }
          
          // Try to get borrow APY from the nested structure
          const borrowApy = borrowInfo?.apy as Record<string, unknown> | undefined;
          
          if (borrowApy?.formatted) {
            rawBorrowAPY = parseFloat(borrowApy.formatted as string);
          } else if (borrowApy?.value) {
            rawBorrowAPY = parseFloat(borrowApy.value as string) * 100; // Convert decimal to percentage
          } else if (borrowApy) {
            rawBorrowAPY = typeof borrowApy === 'string' ? parseFloat(borrowApy) : Number(borrowApy);
          } else if (borrowInfo?.rate) {
            // Alternative field name
            rawBorrowAPY = typeof borrowInfo.rate === 'string' ? parseFloat(borrowInfo.rate as string) : Number(borrowInfo.rate);
          }
          
          supplyAPY = typeof rawSupplyAPY === 'string' ? parseFloat(rawSupplyAPY) : Number(rawSupplyAPY);
          borrowAPY = typeof rawBorrowAPY === 'string' ? parseFloat(rawBorrowAPY) : Number(rawBorrowAPY);
          
          if (isNaN(supplyAPY)) supplyAPY = 0;
          if (isNaN(borrowAPY)) borrowAPY = 0;
          
          console.log(`APY extraction for borrow reserve ${underlyingToken?.symbol}:`, {
            supplyAPY,
            borrowAPY,
            supplyInfo: supplyInfo?.apy,
            borrowInfo: borrowInfo?.apy
          });
          
        } catch (error) {
          console.warn(`Failed to parse APY values for ${underlyingToken?.symbol}:`, error);
          supplyAPY = 0;
          borrowAPY = 0;
        }
        
        // Handle utilization rate
        let utilizationRate = 0;
        try {
          // Extract utilization rate from the nested structure
          let rawUtilization = 0;
          const utilizationRateObj = borrowInfo?.utilizationRate as Record<string, unknown> | undefined;
          
          if (utilizationRateObj?.formatted) {
            rawUtilization = parseFloat(utilizationRateObj.formatted as string);
          } else if (utilizationRateObj?.value) {
            rawUtilization = parseFloat(utilizationRateObj.value as string) * 100; // Convert decimal to percentage
          } else if (borrowInfo?.utilizationRate) {
            rawUtilization = typeof borrowInfo.utilizationRate === 'string' ? parseFloat(borrowInfo.utilizationRate as string) : Number(borrowInfo.utilizationRate);
          } else if (reserve.utilizationRate) {
            rawUtilization = typeof reserve.utilizationRate === 'string' ? parseFloat(reserve.utilizationRate as string) : Number(reserve.utilizationRate);
          }
          
          utilizationRate = typeof rawUtilization === 'string' ? parseFloat(rawUtilization) : Number(rawUtilization);
          if (isNaN(utilizationRate)) utilizationRate = 0;
          
          console.log(`Utilization rate for borrow reserve ${underlyingToken?.symbol}:`, {
            utilizationRate,
            rawUtilization,
            borrowInfo: borrowInfo?.utilizationRate
          });
        } catch (error) {
          console.warn(`Failed to parse utilization rate for ${underlyingToken?.symbol}:`, error);
          utilizationRate = 0;
        }
        
        // Handle price
        let price = 1.0;
        try {
          // Extract price from nested structure
          let rawPrice = 1.0;
          if (reserve.usdExchangeRate) {
            rawPrice = reserve.usdExchangeRate as number;
          } else if (reserve.price) {
            rawPrice = reserve.price as number;
          } else if (size?.usdPerToken) {
            rawPrice = size.usdPerToken as number;
          }
          
          price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
          if (isNaN(price)) price = 1.0;
          
          console.log(`Price for borrow reserve ${underlyingToken?.symbol}:`, {
            price,
            rawPrice,
            usdExchangeRate: reserve.usdExchangeRate,
            size: size?.usdPerToken
          });
        } catch (error) {
          console.warn(`Failed to parse price for ${underlyingToken?.symbol}:`, error);
          price = 1.0;
        }
        
        const poolInfo: AavePoolInfo = {
          symbol: (underlyingToken?.symbol as string) || (reserve.symbol as string) || "UNKNOWN",
          address: (underlyingToken?.address as string) || (reserve.address as string) || "0x0",
          totalSupply: String(totalSupply || "0"),
          totalBorrow: String(totalBorrow || "0"),
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate,
          liquidity: (parseFloat(String(totalSupply || "0")) - parseFloat(String(totalBorrow || "0"))).toFixed(2),
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
    
    // Check if this chain has a dedicated data provider
    const addresses = getAaveAddresses(targetChainId);
    if (!addresses || !addresses.hasDataProvider) {
      console.log(`Chain ${targetChainId} doesn't have a dedicated data provider, using mock data`);
      return getMockPoolDataForChain(targetChainId);
    }
    
    // First try to get real Aave V3 data
    try {
      const realData = await fetchRealAaveMarketData(targetChainId);
      if (realData && realData.length > 0) {
        console.log(`Successfully fetched ${realData.length} reserves from real Aave V3 data`);
        return realData;
      }
    } catch (error) {
      console.log("Real Aave V3 data fetch failed, trying SDK fallback:", error);
    }
    
    // Try SDK fallback
    const market = await fetchAaveMarket(marketAddress, targetChainId);
    
    if (market) {
      // Convert real market data to our format
      const poolInfos = convertMarketToPoolInfos(market);
      console.log(`Converted ${poolInfos.length} reserves from real market data`);
      return poolInfos;
    }
    
    // If real market data fails, fall back to mock data
    console.log(`Market not found, falling back to mock data for chain ${targetChainId}`);
    return getMockPoolDataForChain(targetChainId);
    
  } catch (error) {
    console.error(`Failed to fetch reserves for market ${marketAddress} on chain ${targetChainId}:`, error);
    
    // Final fallback to mock data for supported networks
    return getMockPoolDataForChain(targetChainId);
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
    
    // Return mock data for all supported networks
    return Object.values(MOCK_MARKET_DATA);
  } catch (error) {
    console.error("Failed to fetch all markets:", error);
    throw error;
  }
}

/**
 * Fetch complete Aave market data using GraphQL API
 */
export async function fetchAaveDataWithGraphQL(targetChainId: number): Promise<AavePoolInfo[]> {
  try {
    console.log(`Fetching Aave data with GraphQL for chain ${targetChainId}`);
    
    // Get the correct pool address for this chain
    const addresses = getAaveAddresses(targetChainId);
    if (!addresses) {
      console.log(`No Aave addresses found for chain ${targetChainId}`);
      return [];
    }
    
    // Use the new GraphQL endpoint for Aave V3
    // The old endpoints have been deprecated, using the new unified endpoint
    const graphqlEndpoint = "https://gateway.thegraph.com/api/[api-key]/subgraphs/id/ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH6123cr7";
    
    // For now, we'll use the same endpoint for all chains since the new API is unified
    // You'll need to replace [api-key] with an actual Graph API key
    // For now, we'll skip GraphQL and rely on SDK/contract calls
    console.log("GraphQL endpoints have been deprecated. Using SDK fallback instead.");
    return [];
    
    // Simplified query to get basic reserve data
    const query = `
      query GetReserves($poolAddress: String!) {
        reserves(where: { pool: $poolAddress }, first: 100) {
          id
          name
          symbol
          decimals
          liquidityRate
          variableBorrowRate
          stableBorrowRate
          totalScaledVariableDebt
          totalCurrentVariableDebt
          totalPrincipalStableDebt
          availableLiquidity
          totalLiquidity
          utilizationRate
          totalStableDebt
          totalVariableDebt
          totalDebt
          price {
            priceInEth
          }
        }
      }
    `;
    
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { poolAddress: addresses?.pool?.toLowerCase() }
      })
    });
    
    if (!response.ok) {
      console.error(`GraphQL request failed: ${response.status} ${response.statusText}`);
      throw new Error(`GraphQL request failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("GraphQL response:", data);
    
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    
    const reserves = data.data?.reserves || [];
    console.log(`Found ${reserves.length} reserves in GraphQL response`);
    
    if (reserves.length === 0) {
      console.log("No reserves found in GraphQL response, falling back to contract calls");
      return [];
    }
    
    const poolInfos: AavePoolInfo[] = [];
    
    for (const reserve of reserves) {
      try {
        // Convert rates from basis points to percentages
        const supplyAPY = (Number(reserve.liquidityRate) / 10000) * 100;
        const borrowAPY = (Number(reserve.variableBorrowRate) / 10000) * 100;
        
        // Calculate total supply and borrow with proper decimal handling
        const decimals = Number(reserve.decimals) || 18;
        const totalSupply = Number(reserve.totalLiquidity || reserve.availableLiquidity || 0) / Math.pow(10, decimals);
        const totalBorrow = Number(reserve.totalVariableDebt || reserve.totalDebt || 0) / Math.pow(10, decimals);
        const utilizationRate = Number(reserve.utilizationRate) / 10000;
        
        // Get price (convert from ETH to USD if needed)
        const price = reserve.price?.priceInEth ? Number(reserve.price.priceInEth) : 1.0;
        
        const poolInfo: AavePoolInfo = {
          symbol: reserve.symbol,
          address: reserve.id,
          totalSupply: totalSupply.toFixed(2),
          totalBorrow: totalBorrow.toFixed(2),
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate * 100,
          liquidity: (totalSupply - totalBorrow).toFixed(2),
          price: price,
        };
        
        console.log(`Processed reserve ${reserve.symbol}:`, poolInfo);
        poolInfos.push(poolInfo);
        
      } catch (error) {
        console.warn(`Failed to process reserve ${reserve.symbol}:`, error);
      }
    }
    
    console.log(`Successfully fetched ${poolInfos.length} reserves from GraphQL`);
    return poolInfos;
    
  } catch (error) {
    console.error(`Failed to fetch Aave data with GraphQL for chain ${targetChainId}:`, error);
    
    // Show user-friendly error notification
    showErrorNotification(error, "Aave GraphQL Error");
    
    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes("fetch")) {
        console.error("Network error - GraphQL endpoint might be unavailable");
      } else if (error.message.includes("GraphQL")) {
        console.error("GraphQL query error - endpoint or query might be incorrect");
      }
    }
    
    return [];
  }
}
