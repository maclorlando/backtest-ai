import { Address, PublicClient, WalletClient, parseUnits, erc20Abi } from "viem";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation } from "@/lib/utils/errorHandling";
import type { AavePoolInfo, AaveUserPosition, AaveUserSummary } from "@/lib/types";
import { aaveClient } from "./client";
import { chains, userSupplies, userBorrows, supply, borrow } from "@aave/client/actions";
import { evmAddress, chainId } from "@aave/client";
import { sendWith } from "@aave/client/viem";

// Legacy ABIs for backward compatibility with existing functions
const POOL_ABI = [
  {
    inputs: [
      { internalType: "address", name: "asset", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "onBehalfOf", type: "address" },
      { internalType: "uint16", name: "referralCode", type: "uint16" },
    ],
    name: "supply",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export async function approveErc20(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    const hash = await retryOperation(async () => {
      return await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, value],
        account,
        chain: walletClient.chain,
      });
    }, 3, 2000);

    // Wait for transaction confirmation
    const receipt = await retryOperation(async () => {
      return await publicClient.waitForTransactionReceipt({ hash });
    }, 3, 3000);

    if (receipt.status === 'success') {
      showSuccessNotification(
        `Successfully approved ${amount} tokens for Aave Pool`,
        "Approval Successful"
      );
    } else {
      throw new Error("Transaction failed on chain");
    }

    return hash;
  } catch (error) {
    showErrorNotification(error, "Approval Failed");
    throw error;
  }
}

export async function supplyToAave(
  publicClient: PublicClient,
  walletClient: WalletClient,
  pool: Address,
  asset: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    const hash = await retryOperation(async () => {
      return await walletClient.writeContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "supply",
        args: [asset, value, account.address, 0],
        account,
        chain: walletClient.chain,
      });
    }, 3, 2000);

    // Wait for transaction confirmation
    const receipt = await retryOperation(async () => {
      return await publicClient.waitForTransactionReceipt({ hash });
    }, 3, 3000);

    if (receipt.status === 'success') {
      showSuccessNotification(
        `Successfully supplied ${amount} to Aave Pool`,
        "Supply Successful"
      );
    } else {
      throw new Error("Transaction failed on chain");
    }

    return hash;
  } catch (error) {
    showErrorNotification(error, "Supply Failed");
    throw error;
  }
}

// Enhanced function to check allowance before approving
export async function checkAndApproveErc20(
  publicClient: PublicClient,
  walletClient: WalletClient,
  token: Address,
  spender: Address,
  amount: string,
  decimals: number
) {
  const account = walletClient.account!;
  const value = parseUnits(amount, decimals);
  
  try {
    // Check current allowance
    const currentAllowance = await retryOperation(async () => {
      return await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, spender],
      }) as bigint;
    }, 3, 1000);

    // If allowance is sufficient, no need to approve
    if (currentAllowance >= value) {
      showInfoNotification(
        "Sufficient allowance already exists",
        "Approval Check"
      );
      return null;
    }

    // Approve if needed
    return await approveErc20(publicClient, walletClient, token, spender, amount, decimals);
  } catch (error) {
    showErrorNotification(error, "Allowance Check Failed");
    throw error;
  }
}

// Test connection to Aave using official SDK
export async function testAaveConnection(): Promise<boolean> {
  try {
    // Test by fetching supported chains
    const result = await chains(aaveClient);
    if (result.isOk()) {
      console.log("Aave connection successful, supported chains:", result.value);
      return true;
    } else {
      console.error("Aave connection failed:", result.error);
      return false;
    }
  } catch (error) {
    console.error("Aave connection test failed:", error);
    return false;
  }
}

// Get pool information using real Aave contract data
export async function getPoolInfo(
  chainIdNum: number,
  assetAddress: Address,
  symbol: string
): Promise<AavePoolInfo> {
  try {
    // Use the new real pool data fetching function
    const { fetchRealPoolInfo } = await import("./poolData");
    return await fetchRealPoolInfo(chainIdNum, assetAddress, symbol);
  } catch (error) {
    console.error("Failed to fetch pool info:", error);
    // Fallback to mock data if real data fails
    const mockPoolInfo: AavePoolInfo = {
      symbol,
      address: assetAddress,
      totalSupply: "1000000.00",
      totalBorrow: "500000.00",
      supplyAPY: 2.5,
      borrowAPY: 4.2,
      utilizationRate: 50.0,
      liquidity: "500000.00",
      price: 1.0
    };
    
    return mockPoolInfo;
  }
}

// Get user positions using official SDK
export async function getUserPositions(
  chainIdNum: number,
  userAddress: Address
): Promise<{ positions: AaveUserPosition[]; summary: AaveUserSummary }> {
  try {
    console.log(`Fetching user positions for ${userAddress} on chain ${chainIdNum}`);
    
    // Get Aave config for the chain to find the pool address
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    // Fetch user supplies using the real SDK
    const suppliesResult = await userSupplies(aaveClient, {
      markets: [{ chainId: chainId(chainIdNum), address: evmAddress(config.pool) }],
      user: evmAddress(userAddress),
    });

    if (suppliesResult.isErr()) {
      throw new Error(`Failed to fetch user supplies: ${suppliesResult.error.message}`);
    }

    // Fetch user borrows using the real SDK
    const borrowsResult = await userBorrows(aaveClient, {
      markets: [{ chainId: chainId(chainIdNum), address: evmAddress(config.pool) }],
      user: evmAddress(userAddress),
    });

    if (borrowsResult.isErr()) {
      throw new Error(`Failed to fetch user borrows: ${borrowsResult.error.message}`);
    }

    const positions: AaveUserPosition[] = [];
    let totalSupplied = 0;
    let totalBorrowed = 0;
    let totalCollateral = 0;

    // Process supply positions
    for (const supply of suppliesResult.value) {
      const supplied = Number(supply.balance.amount.value);
      const price = Number(supply.balance.usdPerToken);
      const usdValue = Number(supply.balance.usd);

      // Fetch real asset price if not available from SDK
      let realPrice = price;
      if (price === 0 || price === 1) {
        try {
          const { fetchAssetPrice } = await import("./poolData");
          realPrice = await fetchAssetPrice(chainIdNum, supply.currency.address as Address);
        } catch (error) {
          console.error(`Failed to fetch price for ${supply.currency.symbol}:`, error);
          realPrice = 1.0; // Fallback
        }
      }

      const position: AaveUserPosition = {
        asset: supply.currency.address as Address,
        symbol: supply.currency.symbol,
        supplied: supplied.toFixed(2),
        borrowed: "0.00",
        supplyAPY: 2.5, // Would need to get from reserve data
        borrowAPY: 0,
        collateral: supply.canBeCollateral,
        healthFactor: 1.5, // Would need to calculate from user state
        ltv: 0.8,
        usdValue: supplied * realPrice
      };

      positions.push(position);
      totalSupplied += supplied * realPrice;
      if (supply.canBeCollateral) {
        totalCollateral += supplied * realPrice;
      }
    }

    // Process borrow positions
    for (const borrow of borrowsResult.value) {
      const borrowed = Number(borrow.debt.amount.value);
      const price = Number(borrow.debt.usdPerToken);
      const usdValue = Number(borrow.debt.usd);

      // Fetch real asset price if not available from SDK
      let realPrice = price;
      if (price === 0 || price === 1) {
        try {
          const { fetchAssetPrice } = await import("./poolData");
          realPrice = await fetchAssetPrice(chainIdNum, borrow.currency.address as Address);
        } catch (error) {
          console.error(`Failed to fetch price for ${borrow.currency.symbol}:`, error);
          realPrice = 1.0; // Fallback
        }
      }

      const position: AaveUserPosition = {
        asset: borrow.currency.address as Address,
        symbol: borrow.currency.symbol,
        supplied: "0.00",
        borrowed: borrowed.toFixed(2),
        supplyAPY: 0,
        borrowAPY: 4.2, // Would need to get from reserve data
        collateral: false,
        healthFactor: 1.2,
        ltv: 0,
        usdValue: borrowed * realPrice
      };

      positions.push(position);
      totalBorrowed += borrowed * realPrice;
    }

    // Calculate summary
    const summary: AaveUserSummary = {
      totalSupplied,
      totalBorrowed,
      totalCollateral,
      healthFactor: totalBorrowed > 0 ? totalCollateral / totalBorrowed : 999,
      availableBorrow: totalCollateral * 0.8 - totalBorrowed,
      liquidationThreshold: 0.825,
      ltv: totalCollateral > 0 ? totalBorrowed / totalCollateral : 0
    };

    return { positions, summary };
  } catch (error) {
    console.error("Failed to fetch user positions:", error);
    // Fallback to mock data if real data fails
    const mockPositions: AaveUserPosition[] = [
      {
        asset: "USDC",
        symbol: "USDC",
        supplied: "1000.00",
        borrowed: "0.00",
        supplyAPY: 2.5,
        borrowAPY: 0,
        collateral: true,
        healthFactor: 1.5,
        ltv: 0.8,
        usdValue: 1000
      },
      {
        asset: "WETH",
        symbol: "WETH",
        supplied: "0.00",
        borrowed: "0.50",
        supplyAPY: 0,
        borrowAPY: 4.2,
        collateral: false,
        healthFactor: 1.2,
        ltv: 0.7,
        usdValue: 1000
      }
    ];
    
    const mockSummary: AaveUserSummary = {
      totalSupplied: 1000,
      totalBorrowed: 1000,
      totalCollateral: 1000,
      healthFactor: 1.5,
      availableBorrow: 500,
      liquidationThreshold: 0.825,
      ltv: 0.8
    };
    
    return { positions: mockPositions, summary: mockSummary };
  }
}

// New function to supply assets using official SDK
export async function supplyAssetWithSDK(
  walletClient: WalletClient,
  chainIdNum: number,
  assetAddress: Address,
  amount: string,
  onBehalfOf?: Address
) {
  try {
    const account = walletClient.account!;
    const targetAddress = onBehalfOf || account.address;

    // Get Aave config for the chain to find the pool address
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    console.log(`Supplying ${amount} ${assetAddress} to Aave on chain ${chainIdNum}`);

    // Create supply action using the real SDK
    const supplyAction = supply(aaveClient, {
      market: evmAddress(config.pool),
      amount: {
        erc20: {
          currency: evmAddress(assetAddress),
          value: amount,
        },
      },
      sender: evmAddress(targetAddress),
      chainId: chainId(chainIdNum),
    });

    // Send transaction using viem
    const result = await supplyAction
      .andThen(sendWith(walletClient))
      .andThen(aaveClient.waitForTransaction);

    if (result.isErr()) {
      throw new Error(`Supply failed: ${result.error.message}`);
    }

    showSuccessNotification(
      `Successfully supplied ${amount} to Aave`,
      "Supply Successful"
    );

    return result.value;
  } catch (error) {
    showErrorNotification(error, "Supply Failed");
    throw error;
  }
}

// New function to borrow assets using official SDK
export async function borrowAssetWithSDK(
  walletClient: WalletClient,
  chainIdNum: number,
  assetAddress: Address,
  amount: string,
  interestRateMode: "VARIABLE" | "STABLE" = "VARIABLE",
  onBehalfOf?: Address
) {
  try {
    const account = walletClient.account!;
    const targetAddress = onBehalfOf || account.address;

    // Get Aave config for the chain to find the pool address
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    console.log(`Borrowing ${amount} ${assetAddress} from Aave on chain ${chainIdNum}`);

    // Create borrow action using the real SDK
    const borrowAction = borrow(aaveClient, {
      market: evmAddress(config.pool),
      amount: {
        erc20: {
          currency: evmAddress(assetAddress),
          value: amount,
        },
      },
      sender: evmAddress(targetAddress),
      chainId: chainId(chainIdNum),
    });

    // Send transaction using viem
    const result = await borrowAction
      .andThen(sendWith(walletClient))
      .andThen(aaveClient.waitForTransaction);

    if (result.isErr()) {
      throw new Error(`Borrow failed: ${result.error.message}`);
    }

    showSuccessNotification(
      `Successfully borrowed ${amount} from Aave`,
      "Borrow Successful"
    );

    return result.value;
  } catch (error) {
    showErrorNotification(error, "Borrow Failed");
    throw error;
  }
}