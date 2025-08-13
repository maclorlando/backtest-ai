import { Address } from "viem";
import { AaveV3Sepolia, AaveV3ArbitrumSepolia, AaveV3BaseSepolia } from "@bgd-labs/aave-address-book";

type AddressBookShape = {
  POOL: string;
  POOL_ADDRESSES_PROVIDER: string;
  ASSETS: Record<string, { UNDERLYING: string }>;
};

export type AaveNetworkConfig = {
  pool: Address;
  poolAddressesProvider: Address;
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
    reserves,
  };
}

export function getAaveConfig(chainId: number): AaveNetworkConfig | null {
  if (chainId === 11155111) {
    return normalizeCfg(AaveV3Sepolia as unknown as AddressBookShape);
  }
  if (chainId === 421614) {
    return normalizeCfg(AaveV3ArbitrumSepolia as unknown as AddressBookShape);
  }
  if (chainId === 84532) {
    return normalizeCfg(AaveV3BaseSepolia as unknown as AddressBookShape);
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