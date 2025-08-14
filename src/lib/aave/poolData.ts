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
      return getMockPoolDataForChain(chainId);
    }

    // First try to get real Aave V3 data using the new data provider approach
    try {
      const { fetchRealAaveMarketData } = await import("./marketData");
      const realData = await fetchRealAaveMarketData(chainId);
      if (realData && realData.length > 0) {
        console.log(`Successfully fetched ${realData.length} reserves from real Aave V3 data for chain ${chainId}`);
        return realData;
      }
    } catch (error) {
      console.log("Real Aave V3 data fetch failed, trying SDK fallback:", error);
    }

    // Get the market address for this chain
    const marketAddress = getMarketAddressForChain(chainId);
    if (!marketAddress) {
      console.log(`No market address found for chain ${chainId}, using mock data`);
      return getMockPoolDataForChain(chainId);
    }

    // Try SDK fallback
    try {
      const { fetchMarketReserves } = await import("./marketData");
      const reserves = await fetchMarketReserves(marketAddress, chainId);
      if (reserves && reserves.length > 0) {
        console.log(`Successfully fetched ${reserves.length} reserves from SDK for chain ${chainId}`);
        return reserves;
      }
    } catch (error) {
      console.log("SDK fallback failed:", error);
    }

    // Final fallback to mock data
    console.log(`All real data methods failed for chain ${chainId}, using mock data`);
    return getMockPoolDataForChain(chainId);

  } catch (error) {
    console.error(`Failed to fetch all pool data for chain ${chainId}:`, error);
    
    // Final fallback to mock data for supported networks
    return getMockPoolDataForChain(chainId);
  }
}

/**
 * Get mock pool data for a specific chain
 */
function getMockPoolDataForChain(chainId: number): AavePoolInfo[] {
  const mockData = {
    "1": [
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
    ],
    "8453": [
      {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        totalSupply: "500000000.00",
        totalBorrow: "200000000.00",
        supplyAPY: 2.8,
        borrowAPY: 4.5,
        utilizationRate: 40.0,
        liquidity: "300000000.00",
        price: 1.0,
      },
      {
        symbol: "WETH",
        address: "0x4200000000000000000000000000000000000006",
        totalSupply: "25000.00",
        totalBorrow: "10000.00",
        supplyAPY: 2.1,
        borrowAPY: 3.8,
        utilizationRate: 40.0,
        liquidity: "15000.00",
        price: 3000.0,
      },
      {
        symbol: "cbETH",
        address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
        totalSupply: "15000.00",
        totalBorrow: "6000.00",
        supplyAPY: 1.9,
        borrowAPY: 3.6,
        utilizationRate: 40.0,
        liquidity: "9000.00",
        price: 3200.0,
      },
      {
        symbol: "USDbC",
        address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        totalSupply: "200000000.00",
        totalBorrow: "80000000.00",
        supplyAPY: 2.3,
        borrowAPY: 4.0,
        utilizationRate: 40.0,
        liquidity: "120000000.00",
        price: 1.0,
      },
    ],
    "42161": [
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
  };
  
  const chainData = mockData[chainId.toString()];
  if (chainData) {
    console.log(`Using mock data for chain ${chainId}:`, chainData);
    
    // Ensure the data is properly formatted
    const formattedData = chainData.map((item: any) => ({
      symbol: item.symbol,
      address: item.address,
      totalSupply: item.totalSupply,
      totalBorrow: item.totalBorrow,
      supplyAPY: Number(item.supplyAPY) || 0,
      borrowAPY: Number(item.borrowAPY) || 0,
      utilizationRate: Number(item.utilizationRate) || 0,
      liquidity: item.liquidity,
      price: Number(item.price) || 1.0,
    }));
    
    console.log(`Formatted mock data for chain ${chainId}:`, formattedData);
    return formattedData;
  }
  
  console.log(`No mock data available for chain ${chainId}`);
  return [];
}
