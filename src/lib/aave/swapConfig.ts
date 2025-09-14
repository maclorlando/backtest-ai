// ParaSwap adapter configuration for Base network
// These addresses need to be verified and updated with actual contract addresses
import { Address } from "viem";

export const PARASWAP_CONFIG = {
  // Base network (Chain ID: 8453)
  8453: {
    // ParaSwap adapter addresses - loaded from environment variables or use placeholder
    // TODO: These need to be updated with actual ParaSwap adapter addresses for Base
    // You can find these addresses at: https://developers.paraswap.network/smart-contracts
    SWAP_ADAPTER: (process.env.NEXT_PUBLIC_PARASWAP_SWAP_ADAPTER_BASE || "0x0000000000000000000000000000000000000000") as Address, // ParaSwapSwapAdapter
    REPAY_ADAPTER: (process.env.NEXT_PUBLIC_PARASWAP_REPAY_ADAPTER_BASE || "0x0000000000000000000000000000000000000000") as Address, // ParaSwapRepayAdapter  
    DEBT_SWAP_ADAPTER: (process.env.NEXT_PUBLIC_PARASWAP_DEBT_SWAP_ADAPTER_BASE || "0x0000000000000000000000000000000000000000") as Address, // ParaSwapDebtSwapAdapter
    WITHDRAW_SWAP_ADAPTER: (process.env.NEXT_PUBLIC_PARASWAP_WITHDRAW_SWAP_ADAPTER_BASE || "0x0000000000000000000000000000000000000000") as Address, // ParaSwapWithdrawSwapAdapter
    
    // ParaSwap Augustus Swapper contract
    // NOTE: ParaSwap Augustus V6 on Base: 0x6a000f20005980200259b80c5102003040001068
    AUGUSTUS: (process.env.NEXT_PUBLIC_PARASWAP_AUGUSTUS_BASE || "0x6a000f20005980200259b80c5102003040001068") as Address,
    
    // Token addresses for Base network
    TOKENS: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
      cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as const,
      WETH: "0x4200000000000000000000000000000000000006" as const,
      wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452" as const,
      EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" as const,
      AAVE: "0x63706e401c06ac8513145b7687A14804d17f814b" as const,
    },
  },
  
  // Ethereum network (Chain ID: 1) - for reference
  1: {
    SWAP_ADAPTER: "0x0" as const,
    REPAY_ADAPTER: "0x0" as const,
    DEBT_SWAP_ADAPTER: "0x0" as const,
    WITHDRAW_SWAP_ADAPTER: "0x0" as const,
    AUGUSTUS: "0x0" as const,
    TOKENS: {
      USDC: "0xA0b86a33E6441b8c4C8C0e4b8b2c4C8C0e4b8b2c4" as const,
      WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as const,
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const,
    },
  },
} as const;

// Helper function to get ParaSwap config for a chain
export function getParaSwapConfig(chainId: number) {
  const config = PARASWAP_CONFIG[chainId as keyof typeof PARASWAP_CONFIG];
  if (!config) {
    throw new Error(`ParaSwap not configured for chain ${chainId}`);
  }
  return config;
}

// Check if ParaSwap is properly configured for a chain
export function isParaSwapConfigured(chainId: number): boolean {
  try {
    const config = getParaSwapConfig(chainId);
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const shortZeroAddress = "0x0";
    
    // Check if both Augustus and SwapAdapter are configured
    const augustusConfigured = config.AUGUSTUS !== zeroAddress && config.AUGUSTUS !== shortZeroAddress;
    const adapterConfigured = config.SWAP_ADAPTER !== zeroAddress && config.SWAP_ADAPTER !== shortZeroAddress;
    
    return augustusConfigured && adapterConfigured;
  } catch {
    return false;
  }
}

// Get configuration status for debugging
export function getParaSwapConfigStatus(chainId: number): {
  isConfigured: boolean;
  augustusConfigured: boolean;
  adapterConfigured: boolean;
  missingAddresses: string[];
} {
  try {
    const config = getParaSwapConfig(chainId);
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const shortZeroAddress = "0x0";
    
    const augustusConfigured = config.AUGUSTUS !== zeroAddress && config.AUGUSTUS !== shortZeroAddress;
    const adapterConfigured = config.SWAP_ADAPTER !== zeroAddress && config.SWAP_ADAPTER !== shortZeroAddress;
    
    const missingAddresses: string[] = [];
    if (!augustusConfigured) missingAddresses.push("AUGUSTUS");
    if (!adapterConfigured) missingAddresses.push("SWAP_ADAPTER");
    
    return {
      isConfigured: augustusConfigured && adapterConfigured,
      augustusConfigured,
      adapterConfigured,
      missingAddresses,
    };
  } catch {
    return {
      isConfigured: false,
      augustusConfigured: false,
      adapterConfigured: false,
      missingAddresses: ["AUGUSTUS", "SWAP_ADAPTER"],
    };
  }
}

// TODO: Update these addresses with actual ParaSwap adapter addresses for Base network
// You can find these addresses by:
// 1. Checking Aave's official documentation
// 2. Looking at the deployed contracts on Base network
// 3. Checking ParaSwap's official documentation
// 4. Using tools like Etherscan to find the contracts

// Example of how to update the addresses:
// export const PARASWAP_CONFIG = {
//   8453: {
//     SWAP_ADAPTER: "0x1234567890123456789012345678901234567890" as const,
//     AUGUSTUS: "0x0987654321098765432109876543210987654321" as const,
//     // ... other addresses
//   },
// };
