import { Address } from "viem";
import { 
  AaveV3Sepolia, 
  AaveV3ArbitrumSepolia, 
  AaveV3BaseSepolia,
  AaveV3Ethereum,
  AaveV3Arbitrum,
  AaveV3Avalanche,
  AaveV3Base,
  // AaveV3Bsc, // Not available in address book
  AaveV3Celo,
  AaveV3Gnosis,
  AaveV3Linea,
  AaveV3Metis,
  AaveV3Optimism,
  AaveV3Polygon,
  AaveV3Scroll,
  AaveV3Soneium,
  AaveV3Sonic,
  AaveV3ZkSync,
} from "@bgd-labs/aave-address-book";

type AddressBookShape = {
  POOL: string;
  POOL_ADDRESSES_PROVIDER: string;
  AAVE_PROTOCOL_DATA_PROVIDER: string;
  ORACLE: string;
  ASSETS: Record<string, { UNDERLYING: string }>;
};

export type AaveNetworkConfig = {
  pool: Address;
  poolAddressesProvider: Address;
  aaveProtocolDataProvider: Address;
  priceOracle: Address;
  reserves: Record<string, { underlying: Address; symbol: string }>;
};

function normalizeCfg(book: unknown): AaveNetworkConfig {
  const cfg = book as AddressBookShape;
  const reserves = Object.fromEntries(
    Object.entries(cfg.ASSETS || {}).map(([sym, v]) => [sym, { underlying: v.UNDERLYING as Address, symbol: sym }])
  );
  return {
    pool: cfg.POOL as Address,
    poolAddressesProvider: cfg.POOL_ADDRESSES_PROVIDER as Address,
    aaveProtocolDataProvider: cfg.AAVE_PROTOCOL_DATA_PROVIDER as Address,
    priceOracle: cfg.ORACLE as Address,
    reserves,
  };
}

export function getAaveConfig(chainId: number): AaveNetworkConfig | null {
  // Testnets
  if (chainId === 11155111) {
    return normalizeCfg(AaveV3Sepolia as unknown as AddressBookShape);
  }
  if (chainId === 421614) {
    return normalizeCfg(AaveV3ArbitrumSepolia as unknown as AddressBookShape);
  }
  if (chainId === 84532) {
    return normalizeCfg(AaveV3BaseSepolia as unknown as AddressBookShape);
  }
  
  // Mainnets
  if (chainId === 1) {
    return normalizeCfg(AaveV3Ethereum as unknown as AddressBookShape);
  }
  if (chainId === 42161) {
    return normalizeCfg(AaveV3Arbitrum as unknown as AddressBookShape);
  }
  if (chainId === 43114) {
    return normalizeCfg(AaveV3Avalanche as unknown as AddressBookShape);
  }
  if (chainId === 8453) {
    return normalizeCfg(AaveV3Base as unknown as AddressBookShape);
  }
  // if (chainId === 56) {
  //   return normalizeCfg(AaveV3Bsc as unknown as AddressBookShape);
  // }
  if (chainId === 42220) {
    return normalizeCfg(AaveV3Celo as unknown as AddressBookShape);
  }
  if (chainId === 100) {
    return normalizeCfg(AaveV3Gnosis as unknown as AddressBookShape);
  }
  if (chainId === 59144) {
    return normalizeCfg(AaveV3Linea as unknown as AddressBookShape);
  }
  if (chainId === 1088) {
    return normalizeCfg(AaveV3Metis as unknown as AddressBookShape);
  }
  if (chainId === 10) {
    return normalizeCfg(AaveV3Optimism as unknown as AddressBookShape);
  }
  if (chainId === 137) {
    return normalizeCfg(AaveV3Polygon as unknown as AddressBookShape);
  }
  if (chainId === 534352) {
    return normalizeCfg(AaveV3Scroll as unknown as AddressBookShape);
  }
  if (chainId === 1868) {
    return normalizeCfg(AaveV3Soneium as unknown as AddressBookShape);
  }
  if (chainId === 146) {
    return normalizeCfg(AaveV3Sonic as unknown as AddressBookShape);
  }
  if (chainId === 324) {
    return normalizeCfg(AaveV3ZkSync as unknown as AddressBookShape);
  }
  
  return null;
}

export function mapAssetIdToAaveSymbol(assetId: string): string | null {
  switch (assetId) {
    case "usd-coin":
      return "USDC";
    case "bitcoin":
      return "WBTC";
    case "ethereum":
      return "WETH";
    case "chainlink":
      return "LINK";
    case "aave":
      return "AAVE";
    default:
      return null;
  }
}