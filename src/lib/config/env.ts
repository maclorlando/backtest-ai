// Environment configuration for API keys and settings

export interface EnvironmentConfig {
  // RPC Endpoints (optional - will use defaults if not provided)
  rpcEndpoints?: {
    [chainId: number]: string;
  };
  
  // Feature flags
  enableRealPoolData: boolean;
  enablePriceOracle: boolean;
  enableMultiNetwork: boolean;
}

/**
 * Get environment configuration
 * You can set these environment variables in your .env.local file
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    // RPC Endpoints (optional)
    rpcEndpoints: {
      // You can override default RPC endpoints here
      // Example: 1: "https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY"
    },
    
    // Feature flags
    enableRealPoolData: true, // Re-enabled to get real Aave data
    enablePriceOracle: true,
    enableMultiNetwork: true,
  };
}

/**
 * Get RPC endpoint for a specific chain
 * Falls back to default if not configured
 */
export function getRpcEndpoint(chainId: number): string | undefined {
  const config = getEnvironmentConfig();
  return config.rpcEndpoints?.[chainId];
}

/**
 * Check if real pool data is enabled
 */
export function isRealPoolDataEnabled(): boolean {
  return getEnvironmentConfig().enableRealPoolData;
}

/**
 * Check if price oracle is enabled
 */
export function isPriceOracleEnabled(): boolean {
  return getEnvironmentConfig().enablePriceOracle;
}

/**
 * Check if multi-network support is enabled
 */
export function isMultiNetworkEnabled(): boolean {
  return getEnvironmentConfig().enableMultiNetwork;
}
