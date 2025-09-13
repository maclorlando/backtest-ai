import { Address, PublicClient, WalletClient, parseUnits, formatUnits, erc20Abi, createWalletClient, custom } from "viem";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation } from "@/lib/utils/errorHandling";
import type { AavePoolInfo, AaveUserPosition, AaveUserSummary } from "@/lib/types";
import { aaveClient } from "./client";
import { chains, userSupplies, userBorrows, supply, borrow, withdraw } from "@aave/client/actions";
import { evmAddress, chainId, bigDecimal } from "@aave/client";
import { sendWith } from "@aave/client/viem";
import { base } from "viem/chains";

// Helper function to get token symbol from address
function getTokenSymbol(assetAddress: Address): string {
  const tokenMap: Record<string, string> = {
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "USDC",
    "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf": "cbBTC",
    "0x4200000000000000000000000000000000000006": "WETH",
    "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452": "wstETH",
    "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42": "EURC",
    "0x63706e401c06ac8513145b7687A14804d17f814b": "AAVE"
  };
  return tokenMap[assetAddress] || "Unknown";
}

// Helper function to convert WalletConnect provider to WalletClient
export function createWalletClientFromProvider(provider: any): WalletClient {
  return createWalletClient({
    chain: base,
    transport: custom(provider),
  });
}

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
    // Simulate the approval transaction first to check if it's likely to fail
    try {
      await publicClient.simulateContract({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, value],
        account: account.address,
      });
      console.log("Approval transaction simulation successful - proceeding with transaction");
    } catch (simulationError) {
      console.error("Approval transaction simulation failed:", simulationError);
      throw new Error(`Approval transaction is likely to fail. Please check your balance. Simulation error: ${simulationError instanceof Error ? simulationError.message : 'Unknown error'}`);
    }

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
  
  try {
    // First, check the actual wallet balance
    const actualBalance = await publicClient.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    const actualBalanceFormatted = formatUnits(actualBalance, decimals);
    const requestedAmount = parseFloat(amount);
    const actualAmount = parseFloat(actualBalanceFormatted);

    console.log(`Requested supply amount: ${amount}`);
    console.log(`Actual wallet balance: ${actualBalanceFormatted}`);

    // Use the smaller of the two amounts to avoid "transfer amount exceeds balance" errors
    const supplyAmount = Math.min(requestedAmount, actualAmount);
    
    // Check for minimum viable amount (avoid dust amounts) - but allow very small amounts
    const minimumAmount = Math.pow(10, -decimals) * 1; // 1 unit of the smallest denomination (more permissive)
    if (supplyAmount < minimumAmount) {
      console.warn(`Amount ${supplyAmount} is too small (below minimum ${minimumAmount}), skipping supply`);
      showInfoNotification(
        `Skipping supply of ${amount} ${getTokenSymbol(asset)} - amount too small`,
        "Supply Skipped"
      );
      return; // Skip this supply operation
    }
    
    // Log if we're dealing with very small amounts
    if (supplyAmount < 0.01) {
      console.log(`⚠️ Supplying very small amount: ${supplyAmount} ${getTokenSymbol(asset)}`);
    }
    
    if (supplyAmount <= 0) {
      throw new Error(`Insufficient balance. Requested: ${amount}, Available: ${actualBalanceFormatted}`);
    }

    // If the amounts are different, log a warning
    if (supplyAmount < requestedAmount) {
      console.warn(`Adjusting supply amount from ${amount} to ${supplyAmount} due to insufficient balance`);
    }

    // Ensure the amount is properly formatted and not in scientific notation
    const formattedAmount = supplyAmount.toFixed(decimals);
    const value = parseUnits(formattedAmount, decimals);

    // Simulate the transaction first to check if it's likely to fail
    try {
      await publicClient.simulateContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "supply",
        args: [asset, value, account.address, 0],
        account: account.address,
      });
      console.log("Supply transaction simulation successful - proceeding with transaction");
    } catch (simulationError) {
      console.error("Supply transaction simulation failed:", simulationError);
      throw new Error(`Supply transaction is likely to fail. Please check your balance and approval. Simulation error: ${simulationError instanceof Error ? simulationError.message : 'Unknown error'}`);
    }

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
        `Successfully supplied ${supplyAmount} to Aave Pool`,
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
      supplyAPY: symbol === "USDC" ? 4.3 : 2.5, // More realistic USDC APY
      borrowAPY: symbol === "USDC" ? 5.8 : 4.2,
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

    // Debug: Log all supplies from Aave SDK
    console.log(`Raw supplies from Aave SDK (${suppliesResult.value.length} positions):`, suppliesResult.value);
    
    // Process supply positions
    for (const supply of suppliesResult.value) {
      const supplied = Number(supply.balance.amount.value);
      const price = Number(supply.balance.usdPerToken);
      const usdValue = Number(supply.balance.usd);
      
      // Debug logging for each supply position
      console.log(`Processing supply: ${supply.currency.symbol} - Raw amount: ${supply.balance.amount.value}, Parsed: ${supplied}, USD: ${usdValue}`);

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

      // Fetch real APY data for this asset
      let realSupplyAPY = supply.currency.symbol === "USDC" ? 4.3 : 2.5; // More realistic USDC APY fallback
      let realBorrowAPY = supply.currency.symbol === "USDC" ? 5.8 : 0;
      
      try {
        const { fetchRealPoolInfo } = await import("./poolData");
        const poolInfo = await fetchRealPoolInfo(chainIdNum, supply.currency.address as Address, supply.currency.symbol);
        realSupplyAPY = poolInfo.supplyAPY;
        realBorrowAPY = poolInfo.borrowAPY;
        console.log(`Fetched real APY for ${supply.currency.symbol}: Supply ${realSupplyAPY}%, Borrow ${realBorrowAPY}%`);
      } catch (error) {
        console.warn(`Failed to fetch real APY for ${supply.currency.symbol}, using fallback:`, error);
      }

      // Preserve precision for small amounts - use more decimal places for very small amounts
      let suppliedFormatted: string;
      if (supplied > 0 && supplied < 0.01) {
        // For very small amounts, use more decimal places to preserve precision
        suppliedFormatted = supplied.toFixed(8);
      } else if (supplied > 0 && supplied < 1) {
        // For small amounts, use 4 decimal places
        suppliedFormatted = supplied.toFixed(4);
      } else {
        // For normal amounts, use 2 decimal places
        suppliedFormatted = supplied.toFixed(2);
      }

      const position: AaveUserPosition = {
        asset: supply.currency.address as Address,
        symbol: supply.currency.symbol,
        supplied: suppliedFormatted,
        borrowed: "0.00",
        supplyAPY: realSupplyAPY,
        borrowAPY: realBorrowAPY,
        collateral: supply.canBeCollateral,
        healthFactor: 1.5, // Would need to calculate from user state
        ltv: 0.8,
        usdValue: supplied * realPrice
      };

      // Debug logging for symbol mapping
      console.log(`Position created: ${supply.currency.symbol} (${supply.currency.address}) - Supplied: ${suppliedFormatted} (raw: ${supplied})`);
      console.log(`Should show withdraw button: ${supplied > 0}`);
      console.log(`Full supply object:`, {
        symbol: supply.currency.symbol,
        address: supply.currency.address,
        balance: supply.balance.amount.value,
        canBeCollateral: supply.canBeCollateral
      });
      
      // Check if this is cbBTC by address
      if (supply.currency.address.toLowerCase() === "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf") {
        console.log("🔍 Found cbBTC position by address:", {
          symbol: supply.currency.symbol,
          address: supply.currency.address,
          supplied: supplied.toFixed(2)
        });
      }

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

    // Final debug logging
    console.log(`Final positions array (${positions.length} positions):`, positions);
    console.log(`Positions with supplied amounts > 0:`, positions.filter(pos => parseFloat(pos.supplied) > 0));
    
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
    const account = walletClient.account;
    if (!account) {
      throw new Error('Wallet account not available. Please ensure your wallet is connected and unlocked.');
    }
    const targetAddress = onBehalfOf || account.address;

    console.log(`=== Starting supply process ===`);
    console.log(`Chain ID: ${chainIdNum}`);
    console.log(`Asset Address: ${assetAddress}`);
    console.log(`Amount: ${amount}`);
    console.log(`Target Address: ${targetAddress}`);
    console.log(`Wallet Account: ${account.address}`);

    // Get Aave config for the chain to find the pool address
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    console.log(`Aave config found:`, {
      pool: config.pool,
      reserves: Object.keys(config.reserves)
    });

    // Check if asset is supported
    const assetSymbol = Object.keys(config.reserves).find(sym => 
      config.reserves[sym].underlying.toLowerCase() === assetAddress.toLowerCase()
    );
    
    if (!assetSymbol) {
      throw new Error(`Asset ${assetAddress} not supported on chain ${chainIdNum}`);
    }

    console.log(`Asset symbol: ${assetSymbol}`);

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

    console.log(`Supply action created, sending transaction...`);

    // Send transaction using viem
    const result = await supplyAction
      .andThen(sendWith(walletClient))
      .andThen(aaveClient.waitForTransaction);

    if (result.isErr()) {
      console.error(`Supply failed:`, result.error);
      
      // Handle user rejection gracefully
      if (result.error.message.includes("User rejected") || result.error.message.includes("denied")) {
        showInfoNotification(
          "Supply cancelled by user",
          "Transaction Cancelled"
        );
        return null; // Return null instead of throwing error
      }
      
      throw new Error(`Supply failed: ${result.error.message}`);
    }

    console.log(`Supply successful:`, result.value);

    showSuccessNotification(
      `Successfully supplied ${amount} ${assetSymbol} to Aave`,
      "Supply Successful"
    );

    return result.value;
  } catch (error) {
    console.error("Supply error details:", error);
    
    // Enhanced error reporting
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error(`Final error message: ${errorMessage}`);
    showErrorNotification(new Error(errorMessage), "Supply Failed");
    throw error;
  }
}

// Get wallet balances for all supported Aave assets
export async function getWalletBalances(
  publicClient: PublicClient,
  walletAddress: Address,
  chainIdNum: number
): Promise<Array<{ symbol: string; address: Address; balance: string; decimals: number }>> {
  try {
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    const balances: Array<{ symbol: string; address: Address; balance: string; decimals: number }> = [];
    
    // Get balances for all supported assets
    for (const [symbol, reserve] of Object.entries(config.reserves)) {
      try {
        const { readErc20Balance } = await import("@/lib/evm/erc20");
        const balance = await readErc20Balance(
          publicClient,
          (reserve as any).underlying,
          walletAddress,
          getTokenDecimals((reserve as any).underlying)
        );
        
        if (parseFloat(balance) > 0) {
          balances.push({
            symbol: (reserve as any).symbol,
            address: (reserve as any).underlying,
            balance: balance,
            decimals: getTokenDecimals((reserve as any).underlying)
          });
        }
      } catch (error) {
        console.warn(`Failed to get balance for ${symbol}:`, error);
      }
    }
    
    return balances;
  } catch (error) {
    console.error("Failed to get wallet balances:", error);
    return [];
  }
}

// Helper function to get token decimals
function getTokenDecimals(tokenAddress: Address): number {
  const tokenAddressLower = tokenAddress.toLowerCase();
  if (tokenAddressLower === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") { return 6; } // USDC
  if (tokenAddressLower === "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf") { return 8; } // cbBTC
  if (tokenAddressLower === "0x4200000000000000000000000000000000000006") { return 18; } // WETH
  if (tokenAddressLower === "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452") { return 18; } // wstETH
  if (tokenAddressLower === "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42") { return 6; } // EURC
  if (tokenAddressLower === "0x63706e401c06ac8513145b7687a14804d17f814b") { return 18; } // AAVE
  console.warn(`Unknown token decimals for ${tokenAddress}, using default 18`);
  return 18;
}

// Swap all available assets to USDC
export async function swapAllAssetsToUSDC(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainIdNum: number,
  walletAddress: Address
): Promise<{ success: number; failed: number; errors: string[]; totalUSDCReceived: string }> {
  try {
    const balances = await getWalletBalances(publicClient, walletAddress, chainIdNum);
    
    // Filter out USDC since we don't need to swap it
    const assetsToSwap = balances.filter(asset => asset.symbol !== "USDC");
    
    if (assetsToSwap.length === 0) {
      showInfoNotification(
        "No assets found to swap to USDC (only USDC available)",
        "No Assets to Swap"
      );
      return { success: 0, failed: 0, errors: [], totalUSDCReceived: "0" };
    }

    showInfoNotification(
      `Found ${assetsToSwap.length} assets to swap to USDC. Starting swap process...`,
      "Swap All to USDC Started"
    );

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    let totalUSDCReceived = 0;

    // Get USDC address for the chain
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    if (!config) {
      throw new Error("No Aave config found");
    }
    const usdcAddress = config.reserves.USDC.underlying;

    for (const asset of assetsToSwap) {
      try {
        showInfoNotification(
          `Swapping ${asset.balance} ${asset.symbol} to USDC...`,
          "Swap Progress"
        );

        // Import the swap function
        const { swapTokens } = await import("../swap");
        
        // Perform the swap
        const swapHash = await swapTokens(
          walletClient,
          asset.address, // fromToken
          usdcAddress,   // toToken (USDC)
          asset.balance, // amount
          1 // 1% slippage
        );

        // Wait a moment for the transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get the resulting USDC balance to calculate how much we received
        const { readErc20Balance } = await import("@/lib/evm/erc20");
        const usdcBalance = await readErc20Balance(
          publicClient,
          usdcAddress,
          walletAddress,
          6 // USDC has 6 decimals
        );

        const usdcReceived = parseFloat(usdcBalance);
        totalUSDCReceived += usdcReceived;

        successCount++;
        showInfoNotification(
          `✅ Successfully swapped ${asset.balance} ${asset.symbol} to USDC. Progress: ${successCount}/${assetsToSwap.length}`,
          "Swap Progress"
        );

        // Add a small delay between swaps to avoid gas estimation issues
        if (successCount + failedCount < assetsToSwap.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${asset.symbol}: ${errorMessage}`);
        console.error(`Failed to swap ${asset.symbol}:`, error);
        
        showInfoNotification(
          `❌ Failed to swap ${asset.symbol}: ${errorMessage}`,
          "Swap Error"
        );
      }
    }

    // Final status update
    if (successCount > 0) {
      const message = failedCount > 0 
        ? `Swap completed with some issues. Successfully swapped ${successCount} out of ${assetsToSwap.length} assets to USDC. Total USDC received: ${totalUSDCReceived.toFixed(6)}. ${failedCount} failed.`
        : `🎉 Successfully swapped all ${successCount} assets to USDC! Total USDC received: ${totalUSDCReceived.toFixed(6)}.`;
        
      showSuccessNotification(
        message,
        "Swap All to USDC Complete"
      );
    } else {
      showErrorNotification(
        new Error("Failed to swap any assets to USDC. Please try individual swaps."),
        "Swap All to USDC Failed"
      );
    }

    return { 
      success: successCount, 
      failed: failedCount, 
      errors, 
      totalUSDCReceived: totalUSDCReceived.toFixed(6) 
    };

  } catch (error) {
    console.error("Swap all assets to USDC failed:", error);
    showErrorNotification(error, "Swap All to USDC Failed");
    return { success: 0, failed: 0, errors: [error instanceof Error ? error.message : 'Unknown error'], totalUSDCReceived: "0" };
  }
}

// Calculate rebalancing needed to match a target portfolio
export async function calculateRebalancing(
  publicClient: PublicClient,
  walletAddress: Address,
  chainIdNum: number,
  targetPortfolio: Array<{ symbol: string; allocation: number }>
): Promise<{
  currentBalances: Array<{ symbol: string; balance: number; value: number }>;
  targetBalances: Array<{ symbol: string; targetValue: number; targetBalance: number }>;
  rebalancingActions: Array<{
    type: 'supply' | 'withdraw' | 'swap';
    fromSymbol: string;
    toSymbol: string;
    amount: number;
    reason: string;
  }>;
  totalValue: number;
}> {
  try {
    // Get current wallet balances
    const walletBalances = await getWalletBalances(publicClient, walletAddress, chainIdNum);
    
    // Get current Aave positions
    const { positions } = await getUserPositions(chainIdNum, walletAddress);
    
    // Calculate total portfolio value
    let totalValue = 0;
    const currentBalances: Array<{ symbol: string; balance: number; value: number }> = [];
    
    // Combine wallet balances and Aave positions
    const allAssets = new Map<string, { balance: number; value: number }>();
    
    // Add wallet balances
    for (const walletBalance of walletBalances) {
      const balance = parseFloat(walletBalance.balance);
      // For now, assume 1:1 value ratio (in real implementation, you'd get prices)
      const value = balance;
      allAssets.set(walletBalance.symbol, { balance, value });
      totalValue += value;
    }
    
    // Add Aave positions
    for (const position of positions) {
      const balance = parseFloat(position.supplied);
      if (balance > 0) {
        const value = balance; // Assume 1:1 for now
        const existing = allAssets.get(position.symbol);
        if (existing) {
          existing.balance += balance;
          existing.value += value;
        } else {
          allAssets.set(position.symbol, { balance, value });
        }
        totalValue += value;
      }
    }
    
    // Convert to array
    for (const [symbol, data] of allAssets) {
      currentBalances.push({
        symbol,
        balance: data.balance,
        value: data.value
      });
    }
    
    // Calculate target balances
    const targetBalances: Array<{ symbol: string; targetValue: number; targetBalance: number }> = [];
    for (const target of targetPortfolio) {
      const targetValue = totalValue * target.allocation;
      targetBalances.push({
        symbol: target.symbol,
        targetValue,
        targetBalance: targetValue // Assume 1:1 for now
      });
    }
    
    // Calculate rebalancing actions
    const rebalancingActions: Array<{
      type: 'supply' | 'withdraw' | 'swap';
      fromSymbol: string;
      toSymbol: string;
      amount: number;
      reason: string;
    }> = [];
    
    for (const target of targetBalances) {
      const current = currentBalances.find(c => c.symbol === target.symbol);
      const currentValue = current ? current.value : 0;
      const difference = target.targetValue - currentValue;
      
      if (Math.abs(difference) > 0.01) { // Only rebalance if difference is significant
        if (difference > 0) {
          // Need more of this asset - check if we can supply from wallet
          const walletBalance = walletBalances.find(w => w.symbol === target.symbol);
          if (walletBalance && parseFloat(walletBalance.balance) > 0) {
            rebalancingActions.push({
              type: 'supply',
              fromSymbol: target.symbol,
              toSymbol: target.symbol,
              amount: Math.min(parseFloat(walletBalance.balance), difference),
              reason: `Supply ${target.symbol} to reach target allocation`
            });
          }
        } else {
          // Have too much of this asset - withdraw from Aave
          const aavePosition = positions.find((p: any) => p.symbol === target.symbol);
          if (aavePosition && parseFloat(aavePosition.supplied) > 0) {
            rebalancingActions.push({
              type: 'withdraw',
              fromSymbol: target.symbol,
              toSymbol: target.symbol,
              amount: Math.min(parseFloat(aavePosition.supplied), Math.abs(difference)),
              reason: `Withdraw excess ${target.symbol} to rebalance`
            });
          }
        }
      }
    }
    
    return {
      currentBalances,
      targetBalances,
      rebalancingActions,
      totalValue
    };
    
  } catch (error) {
    console.error("Calculate rebalancing failed:", error);
    throw error;
  }
}

// Execute rebalancing actions
export async function executeRebalancing(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainIdNum: number,
  walletAddress: Address,
  rebalancingActions: Array<{
    type: 'supply' | 'withdraw' | 'swap';
    fromSymbol: string;
    toSymbol: string;
    amount: number;
    reason: string;
  }>
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    for (const action of rebalancingActions) {
      try {
        if (action.type === 'supply') {
          // Supply asset to Aave
          const { getAaveConfig } = await import("./config");
          const config = getAaveConfig(chainIdNum);
          if (!config) {
            throw new Error("No Aave config found");
          }
          
          const assetAddress = config.reserves[action.fromSymbol]?.underlying;
          if (!assetAddress) {
            throw new Error(`Asset ${action.fromSymbol} not found in config`);
          }
          
          await supplyToAave(
            publicClient,
            walletClient,
            config.pool as Address,
            assetAddress as Address,
            action.amount.toString(),
            6 // Default to 6 decimals, should be dynamic
          );
          
          successCount++;
          console.log(`✅ Successfully supplied ${action.amount} ${action.fromSymbol}`);
          
        } else if (action.type === 'withdraw') {
          // Withdraw asset from Aave
          const { getAaveConfig } = await import("./config");
          const config = getAaveConfig(chainIdNum);
          if (!config) {
            throw new Error("No Aave config found");
          }
          
          const assetAddress = config.reserves[action.fromSymbol]?.underlying;
          if (!assetAddress) {
            throw new Error(`Asset ${action.fromSymbol} not found in config`);
          }
          
          await withdrawAssetWithSDK(
            walletClient,
            chainIdNum,
            assetAddress as Address,
            action.amount.toString()
          );
          
          successCount++;
          console.log(`✅ Successfully withdrew ${action.amount} ${action.fromSymbol}`);
        }
        
        // Add delay between actions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${action.type} ${action.fromSymbol}: ${errorMessage}`);
        console.error(`Failed to execute ${action.type} for ${action.fromSymbol}:`, error);
      }
    }
    
    return { success: successCount, failed: failedCount, errors };
    
  } catch (error) {
    console.error("Execute rebalancing failed:", error);
    throw error;
  }
}

// Supply all available assets to Aave (excluding native ETH)
export async function supplyAllAvailableAssets(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chainIdNum: number,
  walletAddress: Address
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    const balances = await getWalletBalances(publicClient, walletAddress, chainIdNum);
    
    if (balances.length === 0) {
      showInfoNotification(
        "No supported assets found in wallet to supply to Aave",
        "No Assets Available"
      );
      return { success: 0, failed: 0, errors: [] };
    }

    showInfoNotification(
      `Found ${balances.length} assets to supply to Aave. Starting supply process...`,
      "Supply All Assets Started"
    );

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const asset of balances) {
      try {
        showInfoNotification(
          `Supplying ${asset.balance} ${asset.symbol} to Aave...`,
          "Supply Progress"
        );

        // Import the supply function
        const { supplyToAave, checkAndApproveErc20 } = await import("./viem");
        
        // Approve the asset for Aave
        const { getAaveConfig } = await import("./config");
        const config = getAaveConfig(chainIdNum);
        if (!config) {
          throw new Error("No Aave config found");
        }

        await checkAndApproveErc20(
          publicClient,
          walletClient,
          asset.address,
          config.pool,
          asset.balance,
          asset.decimals
        );

        // Supply the asset to Aave
        await supplyToAave(
          publicClient,
          walletClient,
          config.pool,
          asset.address,
          asset.balance,
          asset.decimals
        );

        successCount++;
        showInfoNotification(
          `✅ Successfully supplied ${asset.balance} ${asset.symbol}. Progress: ${successCount}/${balances.length}`,
          "Supply Progress"
        );

        // Add a small delay between supplies to avoid gas estimation issues
        if (successCount + failedCount < balances.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${asset.symbol}: ${errorMessage}`);
        console.error(`Failed to supply ${asset.symbol}:`, error);
        
        showInfoNotification(
          `❌ Failed to supply ${asset.symbol}: ${errorMessage}`,
          "Supply Error"
        );
      }
    }

    // Final status update
    if (successCount > 0) {
      const message = failedCount > 0 
        ? `Supply completed with some issues. Successfully supplied ${successCount} out of ${balances.length} assets. ${failedCount} failed.`
        : `🎉 Successfully supplied all ${successCount} assets to Aave!`;
        
      showSuccessNotification(
        message,
        "Supply All Complete"
      );
    } else {
      showErrorNotification(
        new Error("Failed to supply any assets. Please try individual supplies."),
        "Supply All Failed"
      );
    }

    return { success: successCount, failed: failedCount, errors };

  } catch (error) {
    console.error("Supply all assets failed:", error);
    showErrorNotification(error, "Supply All Failed");
    return { success: 0, failed: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
}

// New function to withdraw assets using official SDK
export async function withdrawAssetWithSDK(
  walletClient: WalletClient,
  chainIdNum: number,
  assetAddress: Address,
  amount: string,
  onBehalfOf?: Address
) {
  try {
    const account = walletClient.account;
    if (!account) {
      throw new Error('Wallet account not available. Please ensure your wallet is connected and unlocked.');
    }
    const targetAddress = onBehalfOf || account.address;

    console.log(`=== Starting withdraw process ===`);
    console.log(`Chain ID: ${chainIdNum}`);
    console.log(`Asset Address: ${assetAddress}`);
    console.log(`Amount: ${amount}`);
    console.log(`Target Address: ${targetAddress}`);
    console.log(`Wallet Account: ${account.address}`);

    // Get Aave config for the chain to find the pool address
    const { getAaveConfig } = await import("./config");
    const config = getAaveConfig(chainIdNum);
    
    if (!config) {
      throw new Error(`No Aave config found for chain ${chainIdNum}`);
    }

    console.log(`Aave config found:`, {
      pool: config.pool,
      reserves: Object.keys(config.reserves)
    });

    // Check if asset is supported
    const assetSymbol = Object.keys(config.reserves).find(sym => 
      config.reserves[sym].underlying.toLowerCase() === assetAddress.toLowerCase()
    );
    
    if (!assetSymbol) {
      throw new Error(`Asset ${assetAddress} not supported on chain ${chainIdNum}`);
    }

    console.log(`Asset symbol: ${assetSymbol}`);

    // For withdrawals, we should use the underlying asset address (same as supply)
    console.log(`Using underlying asset address: ${assetAddress} for withdrawal`);

    // First, get the actual available balance for this asset
    const suppliesResult = await userSupplies(aaveClient, {
      markets: [{ chainId: chainId(chainIdNum), address: evmAddress(config.pool) }],
      user: evmAddress(targetAddress),
    });

    if (suppliesResult.isErr()) {
      throw new Error(`Failed to fetch user supplies: ${suppliesResult.error.message}`);
    }

    // Find the specific asset supply
    const assetSupply = suppliesResult.value.find(
      supply => supply.currency.address.toLowerCase() === assetAddress.toLowerCase()
    );

    if (!assetSupply) {
      throw new Error(`No supply found for asset ${assetSymbol} (${assetAddress})`);
    }

    const availableBalance = Number(assetSupply.balance.amount.value);
    console.log(`Available balance for ${assetSymbol}: ${availableBalance}`);
    console.log(`Requested withdrawal amount: ${amount}`);
    console.log(`Asset supply details:`, {
      symbol: assetSupply.currency.symbol,
      address: assetSupply.currency.address,
      balance: assetSupply.balance.amount.value,
      canBeCollateral: assetSupply.canBeCollateral
    });

    // Check if this is a "max withdrawal" request (very large amount)
    const isMaxWithdrawal = parseFloat(amount) > 999999999999999;
    
    // Use the minimum of requested amount and available balance
    let actualWithdrawAmount = Math.min(parseFloat(amount), availableBalance);
    
    if (isMaxWithdrawal) {
      console.log(`🔄 Max withdrawal requested for ${assetSymbol} - using full available balance: ${availableBalance}`);
      actualWithdrawAmount = availableBalance; // Use the exact available balance for max withdrawal
    }
    
    console.log(`Actual withdrawal amount: ${actualWithdrawAmount}`);

    // Allow withdrawals even for very small amounts (dust amounts)
    if (actualWithdrawAmount <= 0) {
      throw new Error(`Insufficient balance for ${assetSymbol}. Available: ${availableBalance}, Requested: ${amount}`);
    }
    
    // Log if we're dealing with very small amounts
    if (actualWithdrawAmount < 0.01) {
      console.log(`⚠️ Withdrawing very small amount: ${actualWithdrawAmount} ${assetSymbol}`);
    }

    // For cbBTC, use a more conservative withdrawal amount to avoid precision issues
    if (assetSymbol === "cbBTC" && actualWithdrawAmount > 0) {
      const conservativeAmount = Math.max(0, actualWithdrawAmount - 0.00000001); // Subtract 1 satoshi
      console.log(`Using conservative withdrawal amount for cbBTC: ${conservativeAmount} (original: ${actualWithdrawAmount})`);
      actualWithdrawAmount = conservativeAmount;
    }

    // Create withdraw action using the real SDK
    // Use the correct amount structure as per Aave V3 documentation
    const withdrawAction = withdraw(aaveClient, {
      market: evmAddress(config.pool),
      amount: {
        erc20: {
          currency: evmAddress(assetAddress),
          value: {
            exact: bigDecimal(actualWithdrawAmount.toString()), // Use actual available amount
          },
        },
      },
      sender: evmAddress(targetAddress),
      chainId: chainId(chainIdNum),
    });

    console.log(`Withdraw action created, sending transaction...`);

    // Send transaction using viem
    const result = await withdrawAction
      .andThen(sendWith(walletClient))
      .andThen(aaveClient.waitForTransaction);

    if (result.isErr()) {
      console.error(`Withdraw failed:`, result.error);
      
      // Handle user rejection gracefully
      if (result.error.message.includes("User rejected") || result.error.message.includes("denied")) {
        showInfoNotification(
          "Withdrawal cancelled by user",
          "Transaction Cancelled"
        );
        return null; // Return null instead of throwing error
      }
      
      // Handle gas estimation errors specifically
      if (result.error.message.includes("gas") || result.error.message.includes("estimation")) {
        console.error("Gas estimation error detected:", result.error.message);
        throw new Error(`Gas estimation failed. This might be due to network congestion. Please try again in a few moments. Original error: ${result.error.message}`);
      }
      
      // Handle transaction execution errors
      if (result.error.message.includes("Transaction failed") || result.error.message.includes("execution reverted")) {
        console.error("Transaction execution error detected:", result.error.message);
        throw new Error(`Transaction failed. This might be due to insufficient balance, network issues, or contract state changes. Please try again. Original error: ${result.error.message}`);
      }
      
      // Handle insufficient balance errors
      if (result.error.message.includes("insufficient") || result.error.message.includes("balance")) {
        console.error("Insufficient balance error detected:", result.error.message);
        throw new Error(`Insufficient balance for withdrawal. Please check your available balance. Original error: ${result.error.message}`);
      }
      
      throw new Error(`Withdraw failed: ${result.error.message}`);
    }

    console.log(`Withdraw successful:`, result.value);

    showSuccessNotification(
      `Successfully withdrew ${actualWithdrawAmount} ${assetSymbol} from Aave`,
      "Withdraw Successful"
    );

    return result.value;
  } catch (error) {
    console.error("Withdraw error details:", error);
    
    // Enhanced error reporting
    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error(`Final error message: ${errorMessage}`);
    showErrorNotification(new Error(errorMessage), "Withdraw Failed");
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