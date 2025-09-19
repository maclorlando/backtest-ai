import { fetchAssetPrice } from '@/lib/aave/poolData';
import { getFallbackPrice } from '@/lib/aave/priceFallback';
import { fetchCurrentPricesUSD } from '@/lib/prices-alchemy';
import type { AaveUserPosition, AssetId } from '@/lib/types';

// Cache for oracle prices to reduce RPC calls
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds cache

// Cached version of fetchAssetPrice to reduce RPC calls
async function getCachedAssetPrice(chainId: number, assetAddress: string): Promise<number> {
  const cacheKey = `${chainId}-${assetAddress}`;
  const now = Date.now();
  
  // Check cache first
  const cached = priceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.price;
  }
  
  try {
    // Fetch from oracle
    const price = await fetchAssetPrice(chainId, assetAddress as `0x${string}`);
    
    // Cache the result
    priceCache.set(cacheKey, { price, timestamp: now });
    
    return price;
  } catch (error) {
    console.warn(`Failed to fetch oracle price for ${assetAddress}:`, error);
    
    // If it's a rate limit error, try to get a fallback price
    if (error instanceof Error && error.message.includes('rate limit')) {
      console.log(`Rate limit hit for ${assetAddress}, using fallback price`);
      // Return a fallback price instead of throwing
      const fallbackPrice = getFallbackPrice(assetAddress);
      if (fallbackPrice > 0) {
        // Cache the fallback price for a shorter duration
        priceCache.set(cacheKey, { price: fallbackPrice, timestamp: now });
        return fallbackPrice;
      }
    }
    
    throw error;
  }
}

export interface AssetPosition {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  chainId: number;
  source: 'wallet' | 'aave';
}

export interface ConsolidatedAsset {
  underlyingSymbol: string; // BTC, ETH, USDC
  totalBalance: number;
  totalValueUSD: number;
  walletBalance: number;
  aaveBalance: number;
  priceUSD: number;
  priceSource: 'oracle' | 'fallback';
}

export interface NAVCalculation {
  totalValueUSD: number;
  assets: Record<string, ConsolidatedAsset>;
  lastUpdated: string;
  hasOracleData: boolean;
}

// Map Aave assets to their underlying assets for portfolio exposure
const ASSET_MAPPING: Record<string, string> = {
  // Direct mappings
  'USDC': 'USDC',
  'USDT': 'USDC', // Treat USDT as USDC exposure
  'DAI': 'USDC',  // Treat DAI as USDC exposure
  
  // Wrapped assets to underlying
  'WETH': 'ETH',
  'wstETH': 'ETH',
  'cbETH': 'ETH',
  
  // Bitcoin variants to BTC
  'WBTC': 'BTC',
  'cbBTC': 'BTC', // Base's Bitcoin token maps to BTC
  
  // Other assets
  'AAVE': 'AAVE',
  'LINK': 'LINK',
  'UNI': 'UNI',
  'EURC': 'EURC',
};

// Map symbols to AssetId for Alchemy price fetching
const SYMBOL_TO_ASSET_ID: Record<string, AssetId> = {
  'USDC': 'usd-coin',
  'cbBTC': 'bitcoin',
  'WETH': 'ethereum',
  'wstETH': 'wrapped-staked-ether',
  'EURC': 'euro-coin',
  'AAVE': 'aave',
  'USDT': 'tether',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
};

/**
 * Get the underlying asset symbol for portfolio exposure calculation
 */
function getUnderlyingAsset(symbol: string): string {
  return ASSET_MAPPING[symbol] || symbol;
}

/**
 * Calculate consolidated NAV from wallet and Aave positions
 */
export async function calculateConsolidatedNAV(
  walletPositions: AssetPosition[],
  aavePositions: AaveUserPosition[],
  chainId: number
): Promise<NAVCalculation> {
  const consolidatedAssets: Record<string, ConsolidatedAsset> = {};
  let totalValueUSD = 0;
  let hasOracleData = false;

  // Get Alchemy prices as fallback
  const allSymbols = [
    ...new Set([
      ...walletPositions.map(p => p.symbol),
      ...aavePositions.map(p => p.symbol)
    ])
  ];
  const assetIds = allSymbols
    .map(symbol => SYMBOL_TO_ASSET_ID[symbol])
    .filter(Boolean) as AssetId[];
  
  let alchemyPrices: Record<string, number> = {};
  if (assetIds.length > 0) {
    try {
      alchemyPrices = await fetchCurrentPricesUSD(assetIds);
    } catch (error) {
      console.warn('Failed to fetch Alchemy prices:', error);
    }
  }

  // Process wallet positions
  for (const position of walletPositions) {
    const underlyingSymbol = getUnderlyingAsset(position.symbol);
    // Note: position.balance is already in human-readable format (from formatUnits), so we don't need to divide by decimals
    const balance = parseFloat(position.balance);
    
    if (balance <= 0) continue;

    try {
      // Try to get price from Aave oracle (with caching)
      const price = await getCachedAssetPrice(chainId, position.address);
      const valueUSD = balance * price;
      
      if (!consolidatedAssets[underlyingSymbol]) {
        consolidatedAssets[underlyingSymbol] = {
          underlyingSymbol,
          totalBalance: 0,
          totalValueUSD: 0,
          walletBalance: 0,
          aaveBalance: 0,
          priceUSD: price,
          priceSource: 'oracle'
        };
      }
      
      consolidatedAssets[underlyingSymbol].walletBalance += balance;
      consolidatedAssets[underlyingSymbol].totalBalance += balance;
      consolidatedAssets[underlyingSymbol].totalValueUSD += valueUSD;
      consolidatedAssets[underlyingSymbol].priceUSD = price;
      totalValueUSD += valueUSD;
      hasOracleData = true;
      
    } catch (error) {
      // Try Alchemy prices as fallback
      const assetId = SYMBOL_TO_ASSET_ID[position.symbol];
      let fallbackPrice = alchemyPrices[assetId || ''] || getFallbackPrice(position.symbol);
      const valueUSD = balance * fallbackPrice;
      
      if (!consolidatedAssets[underlyingSymbol]) {
        consolidatedAssets[underlyingSymbol] = {
          underlyingSymbol,
          totalBalance: 0,
          totalValueUSD: 0,
          walletBalance: 0,
          aaveBalance: 0,
          priceUSD: fallbackPrice,
          priceSource: alchemyPrices[assetId || ''] ? 'oracle' : 'fallback'
        };
      }
      
      consolidatedAssets[underlyingSymbol].walletBalance += balance;
      consolidatedAssets[underlyingSymbol].totalBalance += balance;
      consolidatedAssets[underlyingSymbol].totalValueUSD += valueUSD;
      totalValueUSD += valueUSD;
    }
  }

  // Process Aave positions (aTokens)
  for (const position of aavePositions) {
    const underlyingSymbol = getUnderlyingAsset(position.symbol);
    // Note: position.supplied is already in human-readable format
    const balance = parseFloat(position.supplied);
    
    if (balance <= 0) continue;
    
    // Skip if asset address is undefined
    if (!position.asset) {
      console.warn(`Skipping position ${position.symbol}: asset address is undefined`);
      continue;
    }

    try {
      // Try to get price from Aave oracle (with caching)
      const price = await getCachedAssetPrice(chainId, position.asset);
      const valueUSD = balance * price;
      
      if (!consolidatedAssets[underlyingSymbol]) {
        consolidatedAssets[underlyingSymbol] = {
          underlyingSymbol,
          totalBalance: 0,
          totalValueUSD: 0,
          walletBalance: 0,
          aaveBalance: 0,
          priceUSD: price,
          priceSource: 'oracle'
        };
      }
      
      consolidatedAssets[underlyingSymbol].aaveBalance += balance;
      consolidatedAssets[underlyingSymbol].totalBalance += balance;
      consolidatedAssets[underlyingSymbol].totalValueUSD += valueUSD;
      consolidatedAssets[underlyingSymbol].priceUSD = price;
      totalValueUSD += valueUSD;
      hasOracleData = true;
      
    } catch (error) {
      // Try Alchemy prices as fallback
      const assetId = SYMBOL_TO_ASSET_ID[position.symbol];
      let fallbackPrice = alchemyPrices[assetId || ''] || getFallbackPrice(position.symbol);
      const valueUSD = balance * fallbackPrice;
      
      if (!consolidatedAssets[underlyingSymbol]) {
        consolidatedAssets[underlyingSymbol] = {
          underlyingSymbol,
          totalBalance: 0,
          totalValueUSD: 0,
          walletBalance: 0,
          aaveBalance: 0,
          priceUSD: fallbackPrice,
          priceSource: alchemyPrices[assetId || ''] ? 'oracle' : 'fallback'
        };
      }
      
      consolidatedAssets[underlyingSymbol].aaveBalance += balance;
      consolidatedAssets[underlyingSymbol].totalBalance += balance;
      consolidatedAssets[underlyingSymbol].totalValueUSD += valueUSD;
      totalValueUSD += valueUSD;
    }
  }

  return {
    totalValueUSD,
    assets: consolidatedAssets,
    lastUpdated: new Date().toISOString(),
    hasOracleData
  };
}

/**
 * Get supported assets for portfolio exposure
 */
export function getSupportedAssets(): string[] {
  return ['USDC', 'BTC', 'ETH'];
}

/**
 * Calculate portfolio exposure percentages
 */
export function calculatePortfolioExposure(navData: NAVCalculation): Record<string, number> {
  const exposure: Record<string, number> = {};
  const supportedAssets = getSupportedAssets();
  
  for (const asset of supportedAssets) {
    if (navData.assets[asset]) {
      exposure[asset] = (navData.assets[asset].totalValueUSD / navData.totalValueUSD) * 100;
    } else {
      exposure[asset] = 0;
    }
  }
  
  return exposure;
}
