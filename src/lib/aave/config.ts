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
  ASSETS: Record<string, { UNDERLYING: string; A_TOKEN: string }>;
};

export type AaveNetworkConfig = {
  pool: Address;
  poolAddressesProvider: Address;
  aaveProtocolDataProvider: Address;
  priceOracle: Address;
  reserves: Record<string, { underlying: Address; aToken: Address; symbol: string }>;
};

function normalizeCfg(book: unknown): AaveNetworkConfig {
  const cfg = book as AddressBookShape;
  const reserves = Object.fromEntries(
    Object.entries(cfg.ASSETS || {}).map(([sym, v]) => [sym, { 
      underlying: v.UNDERLYING as Address, 
      aToken: v.A_TOKEN as Address,
      symbol: sym 
    }])
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
    // Custom Base configuration with only the 5 supported assets
    return getCustomBaseConfig();
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

// Custom Base configuration with only the 5 supported assets
function getCustomBaseConfig(): AaveNetworkConfig {
  // Get the base config from the address book for pool addresses
  const baseConfig = normalizeCfg(AaveV3Base as unknown as AddressBookShape);
  
  // Override with only our 5 supported assets
  const customReserves = {
    USDC: {
      underlying: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
      aToken: "0x4D65f8C0A816e21FEC8e0eB77e8c5b5c4b4521B3" as Address, // aBasUSDC
      symbol: "USDC"
    },
    cbBTC: {
      underlying: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
      aToken: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" as Address, // aBascbBTC
      symbol: "cbBTC"
    },
    WETH: {
      underlying: "0x4200000000000000000000000000000000000006" as Address,
      aToken: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7" as Address, // aBasWETH
      symbol: "WETH"
    },
    wstETH: {
      underlying: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" as Address,
      aToken: "0x99CBC45ea5bb7eF3a5BC08FB1B7E56bB2442Ef0D" as Address, // aBaswstETH
      symbol: "wstETH"
    },
    EURC: {
      underlying: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as Address,
      aToken: "0x90DA57E0A6C0d166Bf15764E03b83745Dc90025B" as Address, // aBasEURC
      symbol: "EURC"
    },
    AAVE: {
      underlying: "0x63706e401c06ac8513145b7687A14804d17f814b" as Address,
      aToken: "0x67EAF2BeE4384a2f84Da9Eb8105C661C123736BA" as Address, // aBasAAVE
      symbol: "AAVE"
    }
  };

  return {
    ...baseConfig,
    reserves: customReserves
  };
}

export function mapAssetIdToAaveSymbol(assetId: string): string | null {
  switch (assetId) {
    case "usd-coin":
      return "USDC";
    case "bitcoin":
      return "cbBTC"; // Bitcoin maps to Coinbase Bitcoin (cbBTC) on Base
    case "ethereum":
      return "WETH";
    case "wrapped-staked-ether":
      return "wstETH"; // Wrapped Staked Ethereum
    case "euro-coin":
      return "EURC"; // Euro Coin
    case "aave":
      return "AAVE";
    default:
      return null;
  }
}