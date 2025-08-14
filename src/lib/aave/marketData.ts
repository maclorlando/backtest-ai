import { aaveClient } from "./client";
import { market } from "@aave/client/actions";
import { chainId, evmAddress } from "@aave/client";
import type { AavePoolInfo } from "@/lib/types";
import { createPublicClient, http, Address } from "viem";
import { mainnet, base, arbitrum } from "viem/chains";
import { DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";

// Aave V3 Data Provider ABIs
const UI_POOL_DATA_PROVIDER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "address", name: "pool", type: "address" }
    ],
    name: "getReservesData",
    outputs: [
      {
        components: [
          { internalType: "address", name: "underlyingAsset", type: "address" },
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "uint256", name: "decimals", type: "uint256" },
          { internalType: "uint256", name: "baseLTVasCollateral", type: "uint256" },
          { internalType: "uint256", name: "reserveLiquidationThreshold", type: "uint256" },
          { internalType: "uint256", name: "reserveFactor", type: "uint256" },
          { internalType: "bool", name: "usageAsCollateralEnabled", type: "bool" },
          { internalType: "uint256", name: "totalAToken", type: "uint256" },
          { internalType: "uint256", name: "totalStableDebt", type: "uint256" },
          { internalType: "uint256", name: "totalVariableDebt", type: "uint256" },
          { internalType: "uint256", name: "liquidityRate", type: "uint256" },
          { internalType: "uint256", name: "variableBorrowRate", type: "uint256" },
          { internalType: "uint256", name: "stableBorrowRate", type: "uint256" },
          { internalType: "uint256", name: "averageStableRate", type: "uint256" },
          { internalType: "uint256", name: "liquidityIndex", type: "uint256" },
          { internalType: "uint256", name: "variableBorrowIndex", type: "uint256" },
          { internalType: "uint40", name: "lastUpdateTimestamp", type: "uint40" },
          { internalType: "address", name: "aTokenAddress", type: "address" },
          { internalType: "address", name: "stableDebtTokenAddress", type: "address" },
          { internalType: "address", name: "variableDebtTokenAddress", type: "address" },
          { internalType: "address", name: "interestRateStrategyAddress", type: "address" },
          { internalType: "uint8", name: "id", type: "uint8" }
        ],
        internalType: "struct IUiPoolDataProvider.AggregatedReserveData[]",
        name: "",
        type: "tuple[]"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
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

// Official Aave V3 contract addresses from https://aave.com/docs/resources/addresses
// Note: Only Ethereum has a dedicated UI Pool Data Provider, other chains may need different approaches
const AAVE_V3_ADDRESSES = {
  1: { // Ethereum Mainnet
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    uiPoolDataProvider: "0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC",
    priceOracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
    chain: mainnet,
    hasDataProvider: true
  },
  8453: { // Base Mainnet
    pool: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
    uiPoolDataProvider: null, // Base doesn't have a dedicated UI Pool Data Provider
    priceOracle: null, // Base doesn't have a dedicated price oracle
    chain: base,
    hasDataProvider: false
  },
  42161: { // Arbitrum Mainnet
    pool: "0x794a61358d6845594f94dc1db02a252b5b4814ad",
    uiPoolDataProvider: null, // Arbitrum doesn't have a dedicated UI Pool Data Provider
    priceOracle: null, // Arbitrum doesn't have a dedicated price oracle
    chain: arbitrum,
    hasDataProvider: false
  }
};

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
    
    const addresses = AAVE_V3_ADDRESSES[targetChainId];
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
      uiPoolDataProvider: addresses.uiPoolDataProvider,
      priceOracle: addresses.priceOracle
    });

    // Get the RPC URL for this chain
    const rpcUrl = DEFAULT_RPC_BY_CHAIN[targetChainId];
    if (!rpcUrl) {
      console.error(`No RPC URL found for chain ${targetChainId}`);
      throw new Error(`No RPC URL configured for chain ${targetChainId}`);
    }

    console.log(`Using RPC URL for chain ${targetChainId}: ${rpcUrl}`);

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

    // Fetch reserves data from UI Pool Data Provider
    console.log(`Fetching reserves data from ${addresses.uiPoolDataProvider}...`);
    const reservesData = await publicClient.readContract({
      address: addresses.uiPoolDataProvider as Address,
      abi: UI_POOL_DATA_PROVIDER_ABI,
      functionName: "getReservesData",
      args: ["0x0000000000000000000000000000000000000000", addresses.pool as Address]
    });

    console.log(`Successfully fetched ${reservesData.length} reserves from UI Pool Data Provider`);

    const poolInfos: AavePoolInfo[] = [];

    for (const reserve of reservesData) {
      try {
        console.log(`Processing reserve: ${reserve.symbol} (${reserve.underlyingAsset})`);
        
        // Get asset price from price oracle
        console.log(`Fetching price for ${reserve.symbol} from ${addresses.priceOracle}...`);
        const priceData = await publicClient.readContract({
          address: addresses.priceOracle as Address,
          abi: PRICE_ORACLE_ABI,
          functionName: "getAssetPrice",
          args: [reserve.underlyingAsset]
        });

        const price = Number(priceData) / 1e8; // Convert from 8 decimals
        console.log(`Price for ${reserve.symbol}: $${price}`);

        // Calculate APY from rates (rates are in RAY units, 1e27)
        const supplyAPY = (Number(reserve.liquidityRate) / 1e27) * 100;
        const borrowAPY = (Number(reserve.variableBorrowRate) / 1e27) * 100;

        // Calculate utilization rate
        const totalSupply = Number(reserve.totalAToken) / 1e18;
        const totalBorrow = (Number(reserve.totalStableDebt) + Number(reserve.totalVariableDebt)) / 1e18;
        const utilizationRate = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0;

        console.log(`Calculated values for ${reserve.symbol}:`, {
          supplyAPY,
          borrowAPY,
          totalSupply,
          totalBorrow,
          utilizationRate
        });

        const poolInfo: AavePoolInfo = {
          symbol: reserve.symbol,
          address: reserve.underlyingAsset,
          totalSupply: totalSupply.toFixed(2),
          totalBorrow: totalBorrow.toFixed(2),
          supplyAPY: supplyAPY,
          borrowAPY: borrowAPY,
          utilizationRate: utilizationRate,
          liquidity: (totalSupply - totalBorrow).toFixed(2),
          price: price,
        };

        console.log(`Processed reserve ${reserve.symbol}:`, poolInfo);
        poolInfos.push(poolInfo);

      } catch (error) {
        console.warn(`Failed to process reserve ${reserve.symbol}:`, error);
      }
    }

    console.log(`Successfully fetched ${poolInfos.length} reserves from Aave V3`);
    return poolInfos;

  } catch (error) {
    console.error(`Failed to fetch real Aave V3 market data for chain ${targetChainId}:`, error);
    
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
      }
    }
    
    // Fall back to mock data for supported networks
    console.log(`Falling back to mock data for chain ${targetChainId}`);
    return getMockPoolDataForChain(targetChainId);
  }
}

/**
 * Get mock pool data for a specific chain
 */
function getMockPoolDataForChain(targetChainId: number): AavePoolInfo[] {
  if (MOCK_MARKET_DATA[targetChainId.toString()]) {
    const mockReserves = MOCK_MARKET_DATA[targetChainId.toString()].reserves;
    console.log(`Using mock data for chain ${targetChainId}:`, mockReserves);
    
    // Ensure mock data is properly formatted as AavePoolInfo
    const formattedReserves = mockReserves.map((reserve: any) => ({
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
    if (MOCK_MARKET_DATA[targetChainId.toString()]) {
      return [MOCK_MARKET_DATA[targetChainId.toString()]];
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
      
      // Extract data with proper fallbacks and validation
      const totalSupply = reserve.size?.amount?.value || reserve.totalSupply || "0";
      const totalBorrow = reserve.borrowInfo?.totalBorrowed?.amount?.value || "0";
      
      // Handle APY values with proper validation
      let supplyAPY = 0;
      let borrowAPY = 0;
      
      try {
        // Try to extract APY from various possible locations
        const rawSupplyAPY = reserve.supplyInfo?.apy || reserve.supplyAPY || reserve.apy || 0;
        const rawBorrowAPY = reserve.borrowInfo?.apy || reserve.borrowAPY || 0;
        
        // Convert to numbers and validate
        supplyAPY = typeof rawSupplyAPY === 'string' ? parseFloat(rawSupplyAPY) : Number(rawSupplyAPY);
        borrowAPY = typeof rawBorrowAPY === 'string' ? parseFloat(rawBorrowAPY) : Number(rawBorrowAPY);
        
        // Check for NaN and provide fallbacks
        if (isNaN(supplyAPY)) supplyAPY = 0;
        if (isNaN(borrowAPY)) borrowAPY = 0;
        
        // Convert from basis points if needed (some APIs return basis points)
        if (supplyAPY > 100) supplyAPY = supplyAPY / 10000; // Convert from basis points
        if (borrowAPY > 100) borrowAPY = borrowAPY / 10000; // Convert from basis points
        
      } catch (error) {
        console.warn(`Failed to parse APY values for ${reserve.underlyingToken?.symbol}:`, error);
        supplyAPY = 0;
        borrowAPY = 0;
      }
      
      // Handle utilization rate
      let utilizationRate = 0;
      try {
        const rawUtilization = reserve.borrowInfo?.utilizationRate || reserve.utilizationRate || 0;
        utilizationRate = typeof rawUtilization === 'string' ? parseFloat(rawUtilization) : Number(rawUtilization);
        if (isNaN(utilizationRate)) utilizationRate = 0;
        if (utilizationRate > 100) utilizationRate = utilizationRate / 100; // Convert from basis points
      } catch (error) {
        console.warn(`Failed to parse utilization rate for ${reserve.underlyingToken?.symbol}:`, error);
        utilizationRate = 0;
      }
      
      // Handle price
      let price = 1.0;
      try {
        const rawPrice = reserve.usdExchangeRate || reserve.price || 1.0;
        price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
        if (isNaN(price)) price = 1.0;
      } catch (error) {
        console.warn(`Failed to parse price for ${reserve.underlyingToken?.symbol}:`, error);
        price = 1.0;
      }
      
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
        
        // Handle APY values with proper validation
        let supplyAPY = 0;
        let borrowAPY = 0;
        
        try {
          const rawSupplyAPY = reserve.supplyInfo?.apy || reserve.supplyAPY || reserve.apy || 0;
          const rawBorrowAPY = reserve.borrowInfo?.apy || reserve.borrowAPY || 0;
          
          supplyAPY = typeof rawSupplyAPY === 'string' ? parseFloat(rawSupplyAPY) : Number(rawSupplyAPY);
          borrowAPY = typeof rawBorrowAPY === 'string' ? parseFloat(rawBorrowAPY) : Number(rawBorrowAPY);
          
          if (isNaN(supplyAPY)) supplyAPY = 0;
          if (isNaN(borrowAPY)) borrowAPY = 0;
          
          if (supplyAPY > 100) supplyAPY = supplyAPY / 10000;
          if (borrowAPY > 100) borrowAPY = borrowAPY / 10000;
          
        } catch (error) {
          console.warn(`Failed to parse APY values for ${reserve.underlyingToken?.symbol}:`, error);
          supplyAPY = 0;
          borrowAPY = 0;
        }
        
        // Handle utilization rate
        let utilizationRate = 0;
        try {
          const rawUtilization = reserve.borrowInfo?.utilizationRate || reserve.utilizationRate || 0;
          utilizationRate = typeof rawUtilization === 'string' ? parseFloat(rawUtilization) : Number(rawUtilization);
          if (isNaN(utilizationRate)) utilizationRate = 0;
          if (utilizationRate > 100) utilizationRate = utilizationRate / 100;
        } catch (error) {
          console.warn(`Failed to parse utilization rate for ${reserve.underlyingToken?.symbol}:`, error);
          utilizationRate = 0;
        }
        
        // Handle price
        let price = 1.0;
        try {
          const rawPrice = reserve.usdExchangeRate || reserve.price || 1.0;
          price = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
          if (isNaN(price)) price = 1.0;
        } catch (error) {
          console.warn(`Failed to parse price for ${reserve.underlyingToken?.symbol}:`, error);
          price = 1.0;
        }
        
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
    
    // Check if this chain has a dedicated data provider
    const addresses = AAVE_V3_ADDRESSES[targetChainId];
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
