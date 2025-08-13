// Fallback price data for when external APIs fail
const FALLBACK_PRICES: Record<string, number> = {
  // Stablecoins
  "USDC": 1.0,
  "USDT": 1.0,
  "DAI": 1.0,
  
  // Major cryptocurrencies
  "WETH": 3000.0,
  "ETH": 3000.0,
  "WBTC": 45000.0,
  "BTC": 45000.0,
  "LINK": 15.0,
  "UNI": 8.0,
  "AAVE": 250.0,
  
  // Base tokens
  "cbETH": 3000.0,
  
  // Default fallback
  "DEFAULT": 1.0,
};

/**
 * Get fallback price for an asset when external price sources fail
 */
export function getFallbackPrice(symbol: string): number {
  const upperSymbol = symbol.toUpperCase();
  return FALLBACK_PRICES[upperSymbol] || FALLBACK_PRICES["DEFAULT"];
}

/**
 * Get fallback price for an asset by address (if we have a mapping)
 */
export function getFallbackPriceByAddress(address: string): number {
  // Common token addresses and their symbols
  const addressToSymbol: Record<string, string> = {
    // USDC addresses
    "0xa0b86a33e6441b8c4c8c8c8c8c8c8c8c8c8c8c8": "USDC",
    "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f": "USDC", // Base Sepolia
    
    // USDT addresses
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
    "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a": "USDT", // Base Sepolia
    
    // WETH addresses
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
    "0x4200000000000000000000000000000000000006": "WETH", // Base Sepolia
    
    // WBTC addresses
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
    "0x54114591963CF60EF3aA63bEfD6eC263D98145a4": "WBTC", // Base Sepolia
    
    // LINK addresses
    "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
    "0x810D46F9a9027E28F9B01F75E2bdde839dA61115": "LINK", // Base Sepolia
    
    // cbETH addresses
    "0xbe9895146f7af43049ca1c1ae358b0541ea49704": "cbETH",
    "0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B": "cbETH", // Base Sepolia
  };
  
  const symbol = addressToSymbol[address.toLowerCase()];
  if (symbol) {
    return getFallbackPrice(symbol);
  }
  
  return FALLBACK_PRICES["DEFAULT"];
}

/**
 * Check if we have a fallback price for a given symbol
 */
export function hasFallbackPrice(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return upperSymbol in FALLBACK_PRICES;
}

/**
 * Get all available fallback symbols
 */
export function getAvailableFallbackSymbols(): string[] {
  return Object.keys(FALLBACK_PRICES).filter(key => key !== "DEFAULT");
}
