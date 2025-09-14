"use client";
import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconPlus, IconMinus, IconWallet, IconBuildingBank, IconArrowsExchange, IconX, IconMinimize, IconMaximize, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig, mapAssetIdToAaveSymbol } from "@/lib/aave/config";
import { buildPublicClient, buildPublicClientWithFallback } from "@/lib/wallet/viem";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { checkAndApproveErc20, supplyToAave, getPoolInfo, getUserPositions, supplyAssetWithSDK, borrowAssetWithSDK, withdrawAssetWithSDK } from "@/lib/aave/viem";
import { checkUSDCBalance, getTokenBalance } from "@/lib/swap";

import { getSupportedNetworks, fetchAllPoolData } from "@/lib/aave/poolData";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation } from "@/lib/utils/errorHandling";
import { AaveErrorHandler, parseAaveError, type AaveErrorInfo } from "@/components/AaveErrorHandler";
import type { AssetId, AavePoolInfo, AaveUserPosition, AaveUserSummary } from "@/lib/types";
import { Address, formatEther, parseEther } from "viem";
import { readErc20Balance } from "@/lib/evm/erc20";
import StatusCard, { StatusType } from "@/components/StatusCard";
import { useApp } from "@/lib/context/AppContext";

// Import mock data function for fallback
import { getMockPoolDataForChain } from "@/lib/aave/marketData";

type SavedRecord = {
  allocations: { id: AssetId; allocation: number }[];
  start: string; end: string; mode: "none" | "periodic" | "threshold";
  periodDays?: number; thresholdPct?: number; initialCapital: number;
};

export default function AavePage() {
  // Base Mainnet only for MVP
  const chainId = 8453; // Base Mainnet
  const [portfolios, setPortfolios] = useState<Record<string, SavedRecord>>({});
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [statusType, setStatusType] = useState<StatusType>("info");
  const [statusProgress, setStatusProgress] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<AaveUserPosition[]>([]);
  const [userSummary, setUserSummary] = useState<AaveUserSummary | null>(null);
  const [poolInfo, setPoolInfo] = useState<AavePoolInfo[]>([]);


  const [supplyAmount, setSupplyAmount] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"positions" | "deploy" | "supply" | "rebalance">("positions");
  const [rebalanceTargetPortfolio, setRebalanceTargetPortfolio] = useState<string>("");
  const [walletBalances, setWalletBalances] = useState<Array<{ symbol: string; address: Address; balance: string; decimals: number }>>([]);
  const [operationOutput, setOperationOutput] = useState<string[]>([]);
  const [operationProgress, setOperationProgress] = useState<{ current: number; total: number; currentStep: string } | null>(null);
  const [isOutputModalOpen, setIsOutputModalOpen] = useState<boolean>(true);
  const [isOutputModalMinimized, setIsOutputModalMinimized] = useState<boolean>(true);
  const [rebalancingData, setRebalancingData] = useState<{
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
  } | null>(null);
  const [showCapitalConfirmation, setShowCapitalConfirmation] = useState(false);
  const [availableCapital, setAvailableCapital] = useState<string>("");
  const [requestedCapital, setRequestedCapital] = useState<string>("");
  const { address: walletAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Helper functions for operation output
  const addOutput = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setOperationOutput(prev => [...prev, `[${timestamp}] ${message}`]);
    // Automatically open the modal when there's output
    if (!isOutputModalOpen) {
      setIsOutputModalOpen(true);
    }
  };

  const clearOutput = () => {
    setOperationOutput([]);
    setOperationProgress(null);
  };

  const updateProgress = (current: number, total: number, step: string) => {
    setOperationProgress({ current, total, currentStep: step });
  };

  const clearProgress = () => {
    setOperationProgress(null);
  };

  // Rebalancing functions
  async function calculateRebalancing() {
    if (!walletAddress || !publicClient) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    // Check if a rebalance target portfolio is selected
    if (!rebalanceTargetPortfolio || !portfolios[rebalanceTargetPortfolio]) {
      showErrorNotification(
        new Error("Please select a target portfolio for rebalancing"),
        "No Target Portfolio Selected"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      addOutput("🔄 Calculating rebalancing for selected portfolio...");
      addOutput(`📋 Target Portfolio: ${rebalanceTargetPortfolio}`);
      addOutput(`📊 Portfolio Allocations:`);
      
      // Use the rebalance target portfolio as the target
      const targetPortfolioConfig = portfolios[rebalanceTargetPortfolio];
      const targetPortfolio = targetPortfolioConfig.allocations.map(allocation => ({
        symbol: allocation.id,
        allocation: allocation.allocation / 100 // Convert percentage to decimal
      }));

      // Log the target allocations
      targetPortfolio.forEach(allocation => {
        addOutput(`  • ${allocation.symbol}: ${(allocation.allocation * 100).toFixed(1)}%`);
      });
      addOutput("");

      const { calculateRebalancing: calcRebalancing } = await import("@/lib/aave/viem");
      const data = await calcRebalancing(publicClient, walletAddress as Address, chainId, targetPortfolio);
      
      setRebalancingData(data);
      
      addOutput(`📊 Total portfolio value: $${data.totalValue.toFixed(2)}`);
      addOutput(`📋 Found ${data.rebalancingActions.length} rebalancing actions needed`);
      
      if (data.rebalancingActions.length > 0) {
        addOutput("🔧 Rebalancing actions:");
        data.rebalancingActions.forEach((action, index) => {
          addOutput(`   ${index + 1}. ${action.type.toUpperCase()}: ${action.amount.toFixed(6)} ${action.fromSymbol} - ${action.reason}`);
        });
      } else {
        addOutput("✅ Portfolio is already balanced!");
      }

    } catch (error) {
      console.error("Calculate rebalancing failed:", error);
      addOutput(`❌ Failed to calculate rebalancing: ${error instanceof Error ? error.message : 'Unknown error'}`);
      showErrorNotification(error, "Rebalancing Calculation Failed");
    } finally {
      setLoading(false);
    }
  }

  async function executeRebalancing() {
    if (!walletAddress || !walletClient || !publicClient || !rebalancingData) {
      showErrorNotification(
        new Error("Please connect your wallet and calculate rebalancing first"),
        "Rebalancing Required"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      addOutput("🔄 Executing rebalancing actions...");
      updateProgress(0, rebalancingData.rebalancingActions.length, "Starting rebalancing...");

      const { executeRebalancing: execRebalancing } = await import("@/lib/aave/viem");
      const result = await execRebalancing(
        publicClient,
        walletClient,
        chainId,
        walletAddress as Address,
        rebalancingData.rebalancingActions
      );

      if (result.success > 0) {
        addOutput(`✅ Successfully executed ${result.success} rebalancing actions!`);
        
        if (result.failed > 0) {
          addOutput(`⚠️ ${result.failed} actions failed:`);
          result.errors.forEach(error => addOutput(`   - ${error}`));
        }
        
        addOutput("🔄 Refreshing positions and balances...");
        
        showSuccessNotification(
          `Successfully executed ${result.success} rebalancing actions!`,
          "Rebalancing Complete"
        );
        
        // Refresh positions and balances
        setTimeout(() => {
          refreshPositions();
          addOutput("✅ Positions and balances refreshed");
          clearProgress();
        }, 2000);
      } else {
        addOutput("❌ Failed to execute any rebalancing actions");
        result.errors.forEach(error => addOutput(`   - ${error}`));
        
        showErrorNotification(
          new Error("Failed to execute rebalancing actions. Please check the details and try again."),
          "Rebalancing Failed"
        );
      }

    } catch (error) {
      console.error("Execute rebalancing failed:", error);
      addOutput(`❌ Rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      clearProgress();
      showErrorNotification(error, "Rebalancing Failed");
    } finally {
      setLoading(false);
    }
  }
  const [currentError, setCurrentError] = useState<AaveErrorInfo | null>(null);

  const cfg = getAaveConfig(chainId);
  const chain = CHAINS[chainId];
  const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
  
  // Get supported mainnet networks for Aave
  const supportedNetworks = [1, 8453, 42161]; // Ethereum, Base, Arbitrum mainnets

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bt_portfolios");
      setPortfolios(raw ? (JSON.parse(raw) as Record<string, SavedRecord>) : {});
    } catch { setPortfolios({}); }
  }, []);

  // Auto-refresh positions when wallet or network changes
  useEffect(() => {
    if (walletAddress) {
      refreshPositions();
    }
  }, [walletAddress, chainId]);

  // Auto-fetch network stats when network changes
  useEffect(() => {
    getNetworkStats();
  }, [chainId]);

  // Auto-fetch market data when app loads and network changes
  useEffect(() => {
    fetchPoolPrices();
  }, [chainId]);

  // Initialize operation output on page load
  useEffect(() => {
    addOutput("🚀 Aave Manager initialized");
    addOutput(`🌐 Connected to: ${CHAINS[chainId]?.name || `Chain ${chainId}`}`);
    addOutput("📊 Operation output will appear here for all actions");
    addOutput("💡 This modal is available across all tabs");
  }, []);

  const selectedCfg: SavedRecord | null = selected ? portfolios[selected] : null;

  const supportedAssets = useMemo(() => {
    if (!cfg) return new Set<string>();
    return new Set(Object.keys(cfg.reserves));
  }, [cfg]);

  const validation = useMemo(() => {
    if (!selectedCfg) return null;
    const unsupported: string[] = [];
    for (const a of selectedCfg.allocations) {
      const sym = mapAssetIdToAaveSymbol(a.id);
      if (!sym || !supportedAssets.has(sym)) unsupported.push(a.id);
    }
    return { unsupported };
  }, [selectedCfg, supportedAssets]);




  async function getNetworkStats() {
    try {
      setLoading(true);
      showInfoNotification(
        "Fetching network market statistics...",
        "Fetching"
      );
      
      // Get basic network stats
      const poolData = await retryOperation(
        () => fetchAllPoolData(chainId),
        3, // max retries
        1000 // delay
      );
      
      setPoolInfo(poolData);
      
      // Calculate network totals
      const totalSupply = poolData.reduce((sum, pool) => sum + parseFloat(pool.totalSupply), 0);
      const totalBorrow = poolData.reduce((sum, pool) => sum + parseFloat(pool.totalBorrow), 0);
      const avgSupplyAPY = poolData.reduce((sum, pool) => sum + pool.supplyAPY, 0) / poolData.length;
      const avgBorrowAPY = poolData.reduce((sum, pool) => sum + pool.borrowAPY, 0) / poolData.length;
      
      showSuccessNotification(
        `Network: $${totalSupply.toFixed(0)}M supplied, $${totalBorrow.toFixed(0)}M borrowed, ${avgSupplyAPY.toFixed(2)}% avg supply APY`,
        "Network Stats Updated"
      );
    } catch (error) {
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Failed to fetch network stats");
    } finally {
      setLoading(false);
    }
  }

  async function fetchPoolPrices() {
    try {
      setLoading(true);
      showInfoNotification(
        `Fetching market data for ${CHAINS[chainId]?.name || `Chain ${chainId}`}...`,
        "Fetching"
      );
      
      console.log(`=== Starting fetchPoolPrices for chain ${chainId} ===`);
      
      // Add timeout protection for the entire operation
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout - rate limit may have been hit')), 30000);
      });
      
      // Use the new market data function to fetch all pool data at once
      const poolDataPromise = retryOperation(
        () => fetchAllPoolData(chainId),
        2, // reduced retries to avoid rate limiting
        2000 // increased delay between retries
      );
      
      const poolData = await Promise.race([poolDataPromise, timeoutPromise]) as AavePoolInfo[];
      
      console.log(`=== Raw pool data received for chain ${chainId}:`, poolData);
      console.log(`=== Data type:`, typeof poolData);
      console.log(`=== Array length:`, Array.isArray(poolData) ? poolData.length : 'Not an array');
      
      // Validate the data structure
      if (poolData && Array.isArray(poolData) && poolData.length > 0) {
        console.log(`=== First pool data item:`, poolData[0]);
        console.log(`=== APY values check for chain ${chainId}:`);
        poolData.forEach((pool, index) => {
          console.log(`${index + 1}. ${pool.symbol}: supplyAPY=${pool.supplyAPY}, borrowAPY=${pool.borrowAPY}, utilizationRate=${pool.utilizationRate}`);
          console.log(`  - supplyAPY type: ${typeof pool.supplyAPY}, isNaN: ${isNaN(pool.supplyAPY)}`);
          console.log(`  - borrowAPY type: ${typeof pool.borrowAPY}, isNaN: ${isNaN(pool.borrowAPY)}`);
          console.log(`  - utilizationRate type: ${typeof pool.utilizationRate}, isNaN: ${isNaN(pool.utilizationRate)}`);
        });
        
        setPoolInfo(poolData);
        showSuccessNotification(
          `Fetched information for ${poolData.length} pools on ${CHAINS[chainId]?.name || `Chain ${chainId}`}`,
          "Market Data Updated"
        );
      } else {
        console.log(`=== No valid pool data received for chain ${chainId}, using mock data`);
        // Always set some data to ensure table renders
        const mockData = getMockPoolDataForChain(chainId);
        setPoolInfo(mockData);
        showInfoNotification(
          `Using mock data for ${CHAINS[chainId]?.name || `Chain ${chainId}`}. Real data may be temporarily unavailable due to rate limits.`,
          "Using Mock Data"
        );
      }
    } catch (error) {
      console.error(`=== Error in fetchPoolPrices for chain ${chainId}:`, error);
      
      // Always set some data to ensure table renders
      const mockData = getMockPoolDataForChain(chainId);
      setPoolInfo(mockData);
      
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      
      // Show appropriate error message based on error type
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('rate limit')) {
          showErrorNotification(
            new Error(`Rate limit exceeded for ${CHAINS[chainId]?.name || `Chain ${chainId}`}. Using mock data instead.`),
            "Rate Limited"
          );
        } else {
          showErrorNotification(error, "Failed to fetch pool data");
        }
      } else {
        showErrorNotification(error, "Failed to fetch pool data");
      }
      
      // Show appropriate error message based on error type
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('rate limit')) {
          showErrorNotification(
            new Error(`Rate limit exceeded for ${CHAINS[chainId]?.name || `Chain ${chainId}`}. Using mock data instead.`),
            "Rate Limited"
          );
        } else {
          showErrorNotification(error, "Failed to fetch pool data");
        }
      } else {
        showErrorNotification(error, "Failed to fetch pool data");
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshWalletBalances() {
    if (!walletAddress || !publicClient) return;
    
    try {
      const { getWalletBalances } = await import("@/lib/aave/viem");
      const balances = await getWalletBalances(publicClient, walletAddress as Address, chainId);
      setWalletBalances(balances);
    } catch (error) {
      console.error("Failed to refresh wallet balances:", error);
    }
  }

  async function refreshPositions() {
    if (!walletAddress) return;
    
    try {
      setLoading(true);
      showInfoNotification(
        "Fetching your Aave positions...",
        "Refreshing"
      );
      
      const { positions: userPositions, summary } = await retryOperation(
        () => getUserPositions(chainId, walletAddress as Address),
        3, // max retries
        1000 // delay
      );
      
      // Debug logging for positions data
      console.log("Raw positions data from getUserPositions:", userPositions);
      console.log("Positions with supplied amounts:", userPositions.filter(pos => parseFloat(pos.supplied) > 0));
      
      setPositions(userPositions);
      setUserSummary(summary);
      
      // Also refresh wallet balances
      await refreshWalletBalances();
      
      showSuccessNotification(
        "Your Aave positions have been refreshed",
        "Positions Updated"
      );
    } catch (error) {
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Failed to fetch positions");
    } finally {
      setLoading(false);
    }
  }

  async function withdrawAsset(assetSymbol: string, amount: string) {
    if (!walletAddress) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    if (!walletClient) {
      showErrorNotification(
        new Error("Wallet not connected"),
        "Wallet Error"
      );
      return;
    }

    try {
      setLoading(true);
      const isMaxWithdrawal = parseFloat(amount) > 999999999999999;
      showInfoNotification(
        isMaxWithdrawal ? 
          `Preparing to withdraw maximum available ${assetSymbol} from Aave...` :
        `Preparing to withdraw ${amount} ${assetSymbol} from Aave...`,
        "Withdraw Started"
      );
      
      // Get asset address from config
      console.log(`Looking for asset symbol: ${assetSymbol}`);
      console.log(`Available reserves in config:`, Object.keys(cfg?.reserves || {}));
      console.log(`Full config reserves:`, cfg?.reserves);
      
      const assetAddress = cfg?.reserves[assetSymbol]?.underlying as Address;
      if (!assetAddress) {
        console.error(`Asset ${assetSymbol} not found in Aave config. Available assets:`, Object.keys(cfg?.reserves || {}));
        console.error(`This might be a symbol mapping issue. The Aave SDK might be returning a different symbol than expected.`);
        throw new Error(`Asset ${assetSymbol} not found in Aave config`);
      }
      
      console.log(`Found asset address for ${assetSymbol}: ${assetAddress}`);
      
      // Try SDK first, fallback to legacy if it fails
      try {
        const result = await withdrawAssetWithSDK(walletClient, chainId, assetAddress, amount);
        if (result === null) {
          // User cancelled the transaction
          return;
        }
      } catch (sdkError) {
        console.warn('SDK withdraw failed:', sdkError);
        
        // Handle gas estimation errors specifically
        if (sdkError instanceof Error && sdkError.message.includes('gas')) {
          showErrorNotification(
            new Error(`Gas estimation failed for ${assetSymbol} withdrawal. This might be due to network congestion. Please try again in a few moments.`),
            "Gas Estimation Error"
          );
        throw sdkError;
        }
        
        // If the withdrawal failed due to precision issues, try with a slightly higher amount
        if (sdkError instanceof Error && sdkError.message.includes('insufficient')) {
          try {
            const bufferedAmount = (parseFloat(amount) * 1.001).toFixed(8);
            showInfoNotification(
              `Retrying withdrawal with buffered amount: ${bufferedAmount} ${assetSymbol}`,
              "Withdraw Retry"
            );
            
            const retryResult = await withdrawAssetWithSDK(walletClient, chainId, assetAddress, bufferedAmount);
            if (retryResult === null) {
              return;
            }
          } catch (retryError) {
            throw sdkError; // Throw original error if retry also fails
          }
        } else {
          throw sdkError;
        }
      }
      
      showSuccessNotification(
        `Successfully withdrew ${amount} ${assetSymbol} from Aave!`,
        "Withdraw Successful"
      );
      
      // Refresh positions after withdraw
      setTimeout(() => refreshPositions(), 2000);
    } catch (error) {
      const aaveError = parseAaveError(error, { asset: assetSymbol, chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Withdraw Failed");
    } finally {
      setLoading(false);
    }
  }

  async function emergencyWithdrawAll() {
    if (!walletAddress) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    if (!walletClient) {
      showErrorNotification(
        new Error("Wallet not connected"),
        "Wallet Error"
      );
      return;
    }

    if (positions.length === 0) {
      showErrorNotification(
        new Error("No positions to withdraw"),
        "No Positions"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      addOutput("🚨 Starting Emergency Withdraw All Assets...");
      addOutput("⚠️ This will attempt to withdraw ALL available assets from Aave");
      addOutput("");
      
      showInfoNotification(
        `Preparing emergency withdrawal of all assets...`,
        "Emergency Withdraw Started"
      );
      
      let completedWithdrawals = 0;
      let failedWithdrawals = 0;
      const totalPositions = positions.filter(pos => parseFloat(pos.supplied) > 0).length;
      
      if (totalPositions === 0) {
        addOutput("ℹ️ No assets to withdraw - all positions are empty");
        showInfoNotification(
          "No assets to withdraw - all positions are empty",
          "Nothing to Withdraw"
        );
        return;
      }
      
      addOutput(`📊 Found ${totalPositions} positions with assets to withdraw`);
      addOutput("🔄 Starting withdrawal process...");
      addOutput("");
      
      showInfoNotification(
        `Found ${totalPositions} positions with assets. Starting withdrawal process...`,
        "Emergency Withdraw Progress"
      );
      
      // Debug: Log all positions
      console.log("All positions:", positions);
      console.log("Positions with supplied amount > 0:", positions.filter(pos => parseFloat(pos.supplied) > 0));
      
      for (const position of positions) {
        const suppliedAmount = parseFloat(position.supplied);
        console.log(`Processing position: ${position.symbol} - Supplied: ${position.supplied} (${suppliedAmount})`);
        
        if (suppliedAmount > 0) {
          try {
            addOutput(`🔄 Withdrawing ${position.symbol}: ${position.supplied} tokens`);
            
            showInfoNotification(
              `Withdrawing maximum available ${position.symbol}...`,
              "Emergency Withdraw Progress"
            );
            
            // Use withdrawAssetWithSDK directly with max amount to get real-time balance
            const { withdrawAssetWithSDK } = await import("@/lib/aave/viem");
            const { getAaveConfig } = await import("@/lib/aave/config");
            
            const config = getAaveConfig(chainId);
            if (!config) {
              throw new Error(`No Aave config found for chain ${chainId}`);
            }
            
            // Find the asset address for this symbol
            const assetSymbol = Object.keys(config.reserves).find(sym => 
              config.reserves[sym].underlying.toLowerCase() === position.asset.toLowerCase()
            );
            
            if (!assetSymbol) {
              throw new Error(`Asset ${position.symbol} not found in config`);
            }
            
            const assetAddress = config.reserves[assetSymbol].underlying as Address;
            
            // Get the actual available balance instead of using a hardcoded large number
            // This prevents residual amounts from rounding/precision issues
            const actualBalance = position.supplied;
            
            console.log(`Attempting withdrawal for ${position.symbol} (${assetAddress}) with actual balance: ${actualBalance}`);
            
            await withdrawAssetWithSDK(
              walletClient,
              chainId,
              assetAddress,
              actualBalance
            );
            
            completedWithdrawals++;
            addOutput(`✅ Successfully withdrew ${position.symbol}: ${position.supplied} tokens`);
            
            showInfoNotification(
              `✅ Successfully withdrew maximum ${position.symbol}. Progress: ${completedWithdrawals}/${totalPositions}`,
              "Emergency Withdraw Progress"
            );
            
            // Add a small delay between withdrawals to avoid gas estimation issues
            if (completedWithdrawals < totalPositions) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }
          } catch (error) {
            console.error(`Failed to withdraw ${position.symbol}:`, error);
            failedWithdrawals++;
            addOutput(`❌ Failed to withdraw ${position.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // Try with exact amount if the buffered amount failed
            try {
              addOutput(`🔄 Retrying ${position.symbol} with exact amount...`);
              showInfoNotification(
                `Retrying ${position.symbol} with exact amount...`,
                "Emergency Withdraw Retry"
              );
              await withdrawAsset(position.symbol, position.supplied);
              completedWithdrawals++;
              failedWithdrawals--;
              addOutput(`✅ Retry successful for ${position.symbol}`);
            } catch (retryError) {
              console.error(`Retry also failed for ${position.symbol}:`, retryError);
              addOutput(`❌ Retry failed for ${position.symbol}: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
              
              // For cbBTC, try with an even more conservative amount
              if (position.symbol === "cbBTC") {
                try {
                  const conservativeAmount = (parseFloat(position.supplied) * 0.999).toFixed(8); // 0.1% less
                  showInfoNotification(
                    `Retrying ${position.symbol} with conservative amount: ${conservativeAmount}...`,
                    "Emergency Withdraw Conservative Retry"
                  );
                  await withdrawAsset(position.symbol, conservativeAmount);
                  completedWithdrawals++;
                  failedWithdrawals--;
                } catch (conservativeError) {
                  console.error(`Conservative retry also failed for ${position.symbol}:`, conservativeError);
            showErrorNotification(
                    new Error(`Failed to withdraw ${position.symbol} after multiple attempts: ${conservativeError instanceof Error ? conservativeError.message : 'Unknown error'}`),
                    "Withdraw Failed"
                  );
                }
              } else {
                showErrorNotification(
                  new Error(`Failed to withdraw ${position.symbol}: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`),
              "Partial Withdraw Failed"
            );
              }
            }
          }
        }
      }
      
      // Final status update
      addOutput("");
      if (completedWithdrawals > 0) {
        const message = failedWithdrawals > 0 
          ? `Emergency withdrawal completed with some issues. Successfully withdrew ${completedWithdrawals} out of ${totalPositions} positions. ${failedWithdrawals} failed.`
          : `🎉 Emergency withdrawal completed successfully! Withdrew all ${completedWithdrawals} positions.`;
        
        addOutput(`📊 Emergency Withdraw Results:`);
        addOutput(`  ✅ Successfully withdrew: ${completedWithdrawals} positions`);
        if (failedWithdrawals > 0) {
          addOutput(`  ❌ Failed withdrawals: ${failedWithdrawals} positions`);
        }
        addOutput(`  📈 Success rate: ${Math.round((completedWithdrawals / totalPositions) * 100)}%`);
        addOutput("");
        addOutput("🎊 Emergency withdraw process completed!");
          
        showSuccessNotification(
          message,
          "Emergency Withdraw Complete"
        );
      } else {
        addOutput("❌ Emergency Withdraw Failed:");
        addOutput("  🚫 No assets were successfully withdrawn");
        addOutput("  💡 Please try individual withdrawals or check your positions");
        addOutput("");
        
        showErrorNotification(
          new Error("Failed to withdraw any assets. Please try individual withdrawals."),
          "Emergency Withdraw Failed"
        );
      }
      
      // Refresh positions after emergency withdraw
      addOutput("🔄 Refreshing positions...");
      setTimeout(() => {
        refreshPositions();
        addOutput("✅ Positions refreshed");
      }, 3000);
    } catch (error) {
      showErrorNotification(error, "Emergency Withdraw Failed");
    } finally {
      setLoading(false);
    }
  }

  async function swapAllAssetsToUSDC() {
    if (!walletAddress || !walletClient || !publicClient) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      clearProgress();
      
      // Step 1: Initialize
      addOutput("🚀 Starting Swap All Assets to USDC process...");
      addOutput("📋 This will swap all available assets (except USDC) to USDC");
      addOutput("⛽ Network: Base Mainnet | 🔄 DEX: ParaSwap");
      addOutput("");
      updateProgress(1, 10, "Initializing swap process...");
      
      showInfoNotification(
        "Starting to swap all available assets to USDC...",
        "Swap All to USDC Started"
      );

      // Step 2: Fetch wallet balances
      addOutput("📊 Step 1/4: Fetching wallet balances...");
      addOutput("  🔍 Scanning wallet for assets to swap...");
      updateProgress(2, 10, "Fetching wallet balances...");
      
      const { getWalletBalances } = await import("@/lib/aave/viem");
      const balances = await getWalletBalances(publicClient, walletAddress as Address, chainId);
      const assetsToSwap = balances.filter(asset => asset.symbol !== "USDC");
      
      if (assetsToSwap.length === 0) {
        addOutput("ℹ️ No assets found to swap to USDC (only USDC available)");
        addOutput("💡 You already have USDC or no other assets in your wallet");
        clearProgress();
        showInfoNotification(
          "No assets found to swap to USDC (only USDC available)",
          "No Assets to Swap"
        );
        return;
      }

      addOutput(`✅ Found ${assetsToSwap.length} assets to swap to USDC:`);
      assetsToSwap.forEach((asset, index) => {
        addOutput(`  ${index + 1}. ${asset.balance} ${asset.symbol}`);
      });
      addOutput("");

      // Step 3: Prepare swap process
      addOutput("📋 Step 2/4: Preparing swap process...");
      addOutput(`  🎯 Target: Swap ${assetsToSwap.length} assets to USDC`);
      addOutput(`  ⚠️ You may need to approve tokens and sign transactions`);
      addOutput(`  💰 Estimated gas costs: Variable (depends on approvals needed)`);
      addOutput(`  📈 Slippage tolerance: 1%`);
      addOutput("");
      updateProgress(3, 10, "Preparing swap process...");

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];
      let totalUSDCReceived = 0;

      // Get USDC address for the chain
      const { getAaveConfig } = await import("@/lib/aave/config");
      const config = getAaveConfig(chainId);
      if (!config) {
        throw new Error("No Aave config found");
      }
      const usdcAddress = config.reserves.USDC.underlying;

      // Import the swap function
      const { swapTokens } = await import("@/lib/swap");

      // Step 4: Execute swaps with progress tracking
      addOutput("🔄 Step 3/4: Executing swap operations...");
      addOutput("  🚀 Starting swap process...");
      addOutput("");

      for (let i = 0; i < assetsToSwap.length; i++) {
        const asset = assetsToSwap[i];
        const swapNumber = i + 1;
        
        try {
          addOutput(`🔄 Swap ${swapNumber}/${assetsToSwap.length}: ${asset.balance} ${asset.symbol} → USDC`);
          addOutput(`  📝 Getting quote for ${asset.symbol} to USDC...`);
          updateProgress(4 + i, 10, `Swapping ${asset.symbol} to USDC... (${swapNumber}/${assetsToSwap.length})`);
          
          // Perform the swap
          const swapHash = await swapTokens(
            walletClient,
            asset.address, // fromToken
            usdcAddress,   // toToken (USDC)
            asset.balance, // amount
            1 // 1% slippage
          );

          addOutput(`  ✅ Swap transaction sent: ${swapHash.slice(0, 10)}...`);
          addOutput(`  ⏳ Waiting for ${asset.symbol} swap confirmation...`);

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
          addOutput(`  ✅ Successfully swapped ${asset.balance} ${asset.symbol} to USDC!`);
          addOutput(`  💰 Received: ${usdcReceived.toFixed(6)} USDC`);
          addOutput(`  📊 Progress: ${successCount}/${assetsToSwap.length} swaps completed`);
          addOutput("");

          // Add a small delay between swaps to avoid gas estimation issues
          if (i < assetsToSwap.length - 1) {
            addOutput(`  ⏳ Waiting 2 seconds before next swap...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

        } catch (error) {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${asset.symbol}: ${errorMessage}`);
          console.error(`Failed to swap ${asset.symbol}:`, error);
          
          addOutput(`  ❌ Failed to swap ${asset.symbol}: ${errorMessage}`);
          addOutput(`  📊 Progress: ${successCount}/${assetsToSwap.length} swaps completed`);
          addOutput("");
        }
      }

      // Step 5: Process results
      addOutput("📊 Step 4/4: Processing results...");
      addOutput("");
      updateProgress(9, 10, "Processing results...");
      
      if (successCount > 0) {
        addOutput(`✅ Swap Results:`);
        addOutput(`  🎉 Successfully swapped: ${successCount} assets`);
        addOutput(`  💰 Total USDC received: ${totalUSDCReceived.toFixed(6)} USDC`);
        
        if (failedCount > 0) {
          addOutput(`  ⚠️ Failed swaps: ${failedCount}`);
          addOutput(`  📝 Error details:`);
          errors.forEach(error => addOutput(`     • ${error}`));
        }
        
        const successRate = Math.round((successCount / (successCount + failedCount)) * 100);
        addOutput(`  📈 Success rate: ${successRate}%`);
        addOutput("");
        addOutput("🎊 Swap All to USDC completed successfully!");
        
        showSuccessNotification(
          `Successfully swapped ${successCount} assets to USDC! Total USDC received: ${totalUSDCReceived.toFixed(6)}`,
          "Swap All to USDC Complete"
        );
        
        // Step 6: Refresh data
        addOutput("🔄 Refreshing wallet balances...");
        addOutput("  💰 Updating wallet balances...");
        updateProgress(10, 10, "Refreshing data...");
        
        setTimeout(async () => {
          await refreshWalletBalances();
          addOutput("✅ Wallet balances refreshed!");
          addOutput("");
          addOutput("🏁 Swap All to USDC process finished!");
          clearProgress();
        }, 3000);
      } else {
        addOutput("❌ Swap Results:");
        addOutput("  🚫 No assets were successfully swapped");
        addOutput("  📝 Error details:");
        errors.forEach(error => addOutput(`     • ${error}`));
        addOutput("");
        addOutput("❌ Swap All to USDC failed");
        clearProgress();
        
        showErrorNotification(
          new Error("Failed to swap any assets to USDC. Please check your balances and try again."),
          "Swap All to USDC Failed"
        );
      }

    } catch (error) {
      console.error("Swap all assets to USDC failed:", error);
      addOutput("");
      addOutput("❌ Swap All to USDC Failed:");
      addOutput(`  🚫 Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      addOutput("  💡 Please check your wallet connection and try again");
      addOutput("  🔧 Common issues:");
      addOutput("     • Insufficient gas for transactions");
      addOutput("     • Token approval required");
      addOutput("     • Network connectivity issues");
      addOutput("     • Insufficient liquidity for swaps");
      addOutput("");
      addOutput("🔄 You can try again or contact support if the issue persists");
      
      clearProgress();
      showErrorNotification(error, "Swap All to USDC Failed");
    } finally {
      setLoading(false);
    }
  }

  async function supplyAllAvailableAssets() {
    if (!walletAddress || !walletClient || !publicClient) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      clearProgress();
      
      // Step 1: Initialize
      addOutput("🚀 Starting Supply All Assets process...");
      addOutput("📋 This will supply all available assets from your wallet to Aave");
      addOutput("⛽ Network: Base Mainnet | 🏦 Pool: Aave V3 Base Pool");
      addOutput("");
      updateProgress(1, 10, "Initializing supply process...");
      
      showInfoNotification(
        "Starting to supply all available assets to Aave...",
        "Supply All Started"
      );

      // Step 2: Fetch wallet balances
      addOutput("📊 Step 1/4: Fetching current wallet balances...");
      addOutput("  🔍 Scanning wallet for available assets...");
      updateProgress(2, 10, "Fetching wallet balances...");
      
      const { getWalletBalances } = await import("@/lib/aave/viem");
      const balances = await getWalletBalances(publicClient, walletAddress as Address, chainId);
      const assetsToSupply = balances.filter(asset => parseFloat(asset.balance) > 0);
      
      if (assetsToSupply.length === 0) {
        addOutput("❌ No assets available to supply");
        addOutput("💡 Make sure you have assets in your wallet before trying to supply");
        clearProgress();
        return;
      }

      addOutput(`✅ Found ${assetsToSupply.length} assets to supply:`);
      assetsToSupply.forEach((asset, index) => {
        addOutput(`  ${index + 1}. ${asset.balance} ${asset.symbol}`);
      });
      addOutput("");

      // Step 3: Prepare supply process
      addOutput("📋 Step 2/4: Preparing to supply assets...");
      addOutput(`  🎯 Target: Supply ${assetsToSupply.length} assets to Aave`);
      addOutput(`  ⚠️ You may need to approve tokens and sign transactions`);
      addOutput(`  💰 Estimated gas costs: Variable (depends on approvals needed)`);
      addOutput("");
      updateProgress(3, 10, "Preparing supply process...");

      // Step 4: Execute supply with progress tracking
      addOutput("🔄 Step 3/4: Executing supply operations...");
      addOutput("  🚀 Starting supply process...");
      addOutput("");
      
      // Track progress during supply
      let currentStep = 4;
      const totalSteps = 10;
      const progressInterval = setInterval(() => {
        if (currentStep < totalSteps - 2) {
          currentStep++;
          updateProgress(currentStep, totalSteps, `Supplying assets... (${currentStep - 3}/${assetsToSupply.length})`);
        }
      }, 2000);

      const { supplyAllAvailableAssets: supplyAll } = await import("@/lib/aave/viem");
      const result = await supplyAll(publicClient, walletClient, chainId, walletAddress as Address);
      
      clearInterval(progressInterval);

      // Step 5: Process results
      addOutput("📊 Step 4/4: Processing results...");
      addOutput("");
      updateProgress(9, 10, "Processing results...");

      if (result.success > 0) {
        addOutput(`✅ Supply Results:`);
        addOutput(`  🎉 Successfully supplied: ${result.success} assets`);
        
        if (result.failed > 0) {
          addOutput(`  ⚠️ Failed to supply: ${result.failed} assets`);
          addOutput(`  📝 Error details:`);
          result.errors.forEach(error => addOutput(`     • ${error}`));
        }
        
        const successRate = Math.round((result.success / (result.success + result.failed)) * 100);
        addOutput(`  📈 Success rate: ${successRate}%`);
        addOutput("");
        addOutput("🎊 Supply All Assets completed successfully!");
        
        showSuccessNotification(
          `Successfully supplied ${result.success} assets to Aave!`,
          "Supply All Complete"
        );
        
        // Step 6: Refresh data
        addOutput("🔄 Refreshing positions and wallet balances...");
        addOutput("  📊 Updating Aave positions...");
        updateProgress(10, 10, "Refreshing data...");
        
        setTimeout(async () => {
          await refreshPositions();
          addOutput("  💰 Updating wallet balances...");
          await refreshWalletBalances();
          addOutput("✅ Data refresh complete!");
          addOutput("");
          addOutput("🏁 Supply All Assets process finished!");
          clearProgress();
        }, 2000);
      } else {
        addOutput("❌ Supply Results:");
        addOutput("  🚫 No assets were successfully supplied");
        addOutput("  📝 Error details:");
        result.errors.forEach(error => addOutput(`     • ${error}`));
        addOutput("");
        addOutput("❌ Supply All Assets failed");
        clearProgress();
        
        showErrorNotification(
          new Error("Failed to supply any assets. Please check your balances and try again."),
          "Supply All Failed"
        );
      }

    } catch (error) {
      console.error("Supply all assets failed:", error);
      addOutput("");
      addOutput("❌ Supply All Assets Failed:");
      addOutput(`  🚫 Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      addOutput("  💡 Please check your wallet connection and try again");
      addOutput("  🔧 Common issues:");
      addOutput("     • Insufficient gas for transactions");
      addOutput("     • Token approval required");
      addOutput("     • Network connectivity issues");
      addOutput("");
      addOutput("🔄 You can try again or contact support if the issue persists");
      
      showErrorNotification(error, "Supply All Failed");
    } finally {
      setLoading(false);
      clearProgress();
    }
  }

  async function supplyAsset() {
    if (!selectedAsset || !supplyAmount) return;
    
    if (!walletAddress) {
      showErrorNotification(
        new Error("Please connect your wallet first"),
        "Wallet Required"
      );
      return;
    }

    // Validate amount
    const amount = parseFloat(supplyAmount);
    if (isNaN(amount) || amount <= 0) {
      showErrorNotification(
        new Error("Please enter a valid amount"),
        "Invalid Amount"
      );
      return;
    }

    try {
      setLoading(true);
      clearOutput();
      addOutput(`🔄 Starting supply of ${supplyAmount} ${selectedAsset} to Aave...`);
      
      showInfoNotification(
        `Preparing to supply ${supplyAmount} ${selectedAsset} to Aave...`,
        "Supply Started"
      );
      
      if (!walletClient) {
        throw new Error("Wallet not connected");
      }
      
      // Get asset address from config
      const assetAddress = cfg?.reserves[selectedAsset]?.underlying as Address;
      if (!assetAddress) {
        throw new Error(`Asset ${selectedAsset} not found in Aave config`);
      }
      
      // Try SDK first, fallback to legacy if it fails
      try {
        const result = await supplyAssetWithSDK(walletClient, chainId, assetAddress, supplyAmount);
        if (result === null) {
          // User cancelled the transaction
          return;
        }
      } catch (sdkError) {
        console.warn('SDK supply failed, trying legacy method:', sdkError);
        
        // Fallback to legacy supply method
        if (!cfg) {
          throw new Error('Aave config not available for fallback');
        }
        const pub = buildPublicClientWithFallback(chain, rpc);
        await checkAndApproveErc20(pub, walletClient, assetAddress, cfg.pool as Address, supplyAmount, 6);
        await supplyToAave(pub, walletClient, cfg.pool as Address, assetAddress, supplyAmount, 6);
      }
      
      addOutput(`✅ Successfully supplied ${supplyAmount} ${selectedAsset} to Aave!`);
      addOutput("🔄 Refreshing positions...");
      
      showSuccessNotification(
        `Successfully supplied ${supplyAmount} ${selectedAsset} to Aave! You now have a${selectedAsset} tokens earning interest.`,
        "Supply Successful"
      );
      setSupplyAmount("");
      setSelectedAsset("");
      
      // Refresh positions after supply
      setTimeout(() => {
        refreshPositions();
        addOutput("✅ Positions refreshed");
      }, 2000);
    } catch (error) {
      const aaveError = parseAaveError(error, { asset: selectedAsset, chainId });
      setCurrentError(aaveError);
      addOutput(`❌ Supply failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      showErrorNotification(error, "Supply Failed");
    } finally {
      setLoading(false);
    }
  }

  // Function to deploy with available capital using ParaSwap + direct Aave supply
  const deployWithAvailableCapital = async () => {
    if (!selectedCfg || !walletClient || !walletAddress) {
      showErrorNotification(new Error("Please connect your wallet and select a portfolio"), "Deployment Failed");
      return;
    }
    
    setShowCapitalConfirmation(false);
    setLoading(true);
    clearOutput();
    addOutput("🚀 Starting Portfolio Deployment...");
    addOutput("📋 Using ParaSwap + Aave supply strategy");
    addOutput("💰 Deploying with available capital");
    addOutput("");
    setStatusType("loading");
    setStatusProgress(0);

    try {
      const cfg = getAaveConfig(chainId);
      if (!cfg) {
        throw new Error(`No Aave config found for chain ${chainId}`);
      }

      // Get the actual USDC balance from the wallet
      const usdcReserve = cfg.reserves.USDC;
      if (!usdcReserve) {
        throw new Error("USDC reserve not found in Aave config");
      }

      const currentUSDCBalance = await getTokenBalance(usdcReserve.underlying as Address, walletAddress as Address, 6);
      const availableCapitalAmount = parseFloat(currentUSDCBalance);
      
      if (availableCapitalAmount <= 0) {
        throw new Error("No USDC balance available for deployment");
      }

      console.log(`Available USDC balance: ${currentUSDCBalance}`);
      
      // Step 1: Test ParaSwap API connectivity first
      addOutput("=== STEP 1: Testing ParaSwap API Connectivity ===");
      addOutput("🔍 Testing ParaSwap API...");
      setStatusProgress(5);
      
      const { testParaSwapAPI } = await import("@/lib/swap");
      const apiTest = await testParaSwapAPI(chainId);
      
      if (!apiTest.isWorking) {
        addOutput(`❌ ParaSwap API is not working: ${apiTest.error}`);
        addOutput("🛑 Portfolio deployment stopped due to ParaSwap API issues.");
        addOutput("💡 Please try again later or use manual swapping through other DEXs.");
        
        setStatusType("error");
        setStatusProgress(0);
        throw new Error(`ParaSwap API is not working: ${apiTest.error}`);
      } else {
        addOutput("✅ ParaSwap API is working!");
      }
      
      // Step 2: Multi-swap USDC to portfolio assets using ParaSwap
      addOutput("");
      addOutput("=== STEP 2: Multi-Swapping USDC to Portfolio Assets ===");
      addOutput("🔄 Using ParaSwap multi-swap to convert USDC to portfolio assets...");
      setStatusProgress(10);
      
      const pub = buildPublicClientWithFallback(chain, rpc);
      const assetAllocations = selectedCfg.allocations;
      const totalAllocation = assetAllocations.reduce((sum, asset) => sum + asset.allocation, 0);
      
      // Calculate amounts for each asset based on allocation and prepare multi-swap
      const assetAmounts: { symbol: string; amount: string; usdcAmount: string }[] = [];
      const swaps: Array<{
        fromToken: Address;
        toToken: Address;
        amount: string;
        slippage?: number;
        assetId: string;
      }> = [];
      
      for (const asset of assetAllocations) {
        if (asset.id === "usd-coin") {
          // Keep USDC as is
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          assetAmounts.push({
            symbol: "USDC",
            amount: usdcAmount,
            usdcAmount: usdcAmount
          });
        } else if (asset.id === "bitcoin") {
          // Prepare cbBTC swap for multi-swap
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          const cbBTCReserve = cfg.reserves.cbBTC;
          if (cbBTCReserve) {
            swaps.push({
              fromToken: usdcReserve.underlying as Address,
              toToken: cbBTCReserve.underlying as Address,
              amount: usdcAmount,
              slippage: 1,
              assetId: "bitcoin"
            });
          }
        } else if (asset.id === "ethereum") {
          // Prepare WETH swap for multi-swap
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          const wethReserve = cfg.reserves.WETH;
          if (wethReserve) {
            swaps.push({
              fromToken: usdcReserve.underlying as Address,
              toToken: wethReserve.underlying as Address,
              amount: usdcAmount,
              slippage: 1,
              assetId: "ethereum"
            });
          }
        } else if (asset.id === "wrapped-staked-ether") {
          // Prepare wstETH swap for multi-swap
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          const wstETHReserve = cfg.reserves.wstETH;
          if (wstETHReserve) {
            swaps.push({
              fromToken: usdcReserve.underlying as Address,
              toToken: wstETHReserve.underlying as Address,
              amount: usdcAmount,
              slippage: 1,
              assetId: "wrapped-staked-ether"
            });
          }
        } else if (asset.id === "euro-coin") {
          // Prepare EURC swap for multi-swap
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          const eurcReserve = cfg.reserves.EURC;
          if (eurcReserve) {
            swaps.push({
              fromToken: usdcReserve.underlying as Address,
              toToken: eurcReserve.underlying as Address,
              amount: usdcAmount,
              slippage: 1,
              assetId: "euro-coin"
            });
          }
        } else if (asset.id === "aave") {
          // Prepare AAVE swap for multi-swap
          const usdcAmount = (availableCapitalAmount * asset.allocation / totalAllocation).toFixed(2);
          const aaveReserve = cfg.reserves.AAVE;
          if (aaveReserve) {
            swaps.push({
              fromToken: usdcReserve.underlying as Address,
              toToken: aaveReserve.underlying as Address,
              amount: usdcAmount,
              slippage: 1,
              assetId: "aave"
            });
          }
        } else {
          // Unknown asset - skip it but log a warning
          console.warn(`Unknown asset ID: ${asset.id}, skipping...`);
          addOutput(`  ⚠️ Warning: Unknown asset ${asset.id}, skipping...`);
        }
      }
      
      // Execute multi-swap if we have swaps to perform
      if (swaps.length > 0) {
        addOutput("");
        addOutput(`🔄 Executing multi-swap for ${swaps.length} assets...`);
        
        try {
          const { multiSwapTokens } = await import("@/lib/swap");
          const multiSwapHash = await multiSwapTokens(walletClient, swaps, 1);
          addOutput(` ✅ Multi-swap completed successfully (tx: ${multiSwapHash.slice(0, 10)}...)`);
          
          // Wait for transactions to be processed
          addOutput("  ⏳ Waiting for transactions to be processed...");
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Get balances for all swapped assets
          for (const swap of swaps) {
            const assetId = swap.assetId;
            let symbol: string;
            let decimals: number;
            
            if (assetId === "bitcoin") {
              symbol = "cbBTC";
              decimals = 8;
            } else if (assetId === "ethereum") {
              symbol = "WETH";
              decimals = 18;
            } else if (assetId === "wrapped-staked-ether") {
              symbol = "wstETH";
              decimals = 18;
            } else if (assetId === "euro-coin") {
              symbol = "EURC";
              decimals = 6;
            } else if (assetId === "aave") {
              symbol = "AAVE";
              decimals = 18;
            } else {
              continue;
            }
            
            const balance = await getTokenBalance(swap.toToken, walletAddress as Address, decimals);
            if (parseFloat(balance) > 0) {
            assetAmounts.push({
                symbol: symbol,
                amount: balance,
                usdcAmount: swap.amount
              });
            } else {
              console.warn(`${symbol} balance is 0 after swap, this might indicate a swap issue`);
              addOutput(`  ⚠️ Warning: ${symbol} balance is 0 after swap`);
            }
          }
          
        } catch (multiSwapError) {
          console.error("Multi-swap failed:", multiSwapError);
          addOutput(` ❌ Multi-swap failed: ${multiSwapError instanceof Error ? multiSwapError.message : 'Unknown error'}`);
          addOutput("  🛑 Portfolio deployment stopped due to multi-swap failure.");
          throw new Error(`Multi-swap failed: ${multiSwapError instanceof Error ? multiSwapError.message : 'Unknown error'}`);
        }
      } else {
        addOutput("  ℹ️ No swaps needed - only USDC in portfolio");
      }
      
      // Consolidate USDC amounts if multiple allocations fell back to USDC
      const consolidatedAssetAmounts: { symbol: string; amount: string; usdcAmount: string }[] = [];
      const usdcTotal = assetAmounts
        .filter(asset => asset.symbol === "USDC")
        .reduce((sum, asset) => sum + parseFloat(asset.amount), 0);
      
      if (usdcTotal > 0) {
        consolidatedAssetAmounts.push({
          symbol: "USDC",
          amount: usdcTotal.toFixed(2),
          usdcAmount: usdcTotal.toFixed(2)
        });
      }
      
      // Add non-USDC assets
      assetAmounts
        .filter(asset => asset.symbol !== "USDC")
        .forEach(asset => consolidatedAssetAmounts.push(asset));
      
      setStatusProgress(50);
      
      if (consolidatedAssetAmounts.length === 0) {
        throw new Error("No assets to supply after processing allocations");
      }

      // Step 3: Supply all assets directly to Aave
      addOutput("");
      addOutput("=== STEP 3: Supplying Assets to Aave ===");
      addOutput("🏦 Supplying all portfolio assets directly to Aave...");
      setStatusProgress(55);
      
      // Supply each asset to Aave
      let completedAssets = 0;
      for (const assetAmount of consolidatedAssetAmounts) {
        const reserve = cfg.reserves[assetAmount.symbol];
        if (!reserve) {
          console.warn(`Reserve not found for ${assetAmount.symbol}, skipping...`);
          continue;
        }

        // Skip assets with 0 balance
        if (parseFloat(assetAmount.amount) === 0) {
          console.warn(`Skipping ${assetAmount.symbol} with 0 balance`);
          addOutput(`  ⚠️ Skipping ${assetAmount.symbol} (0 balance)`);
          continue;
        }

        addOutput(`  Step ${3 + completedAssets}/${3 + consolidatedAssetAmounts.length}: Supplying ${assetAmount.amount} ${assetAmount.symbol} to Aave...`);
        
        // Determine decimals based on asset type
        const decimals = assetAmount.symbol === "cbBTC" ? 8 :  // cbBTC: 8 decimals
                        assetAmount.symbol === "WETH" ? 18 :   // WETH: 18 decimals
                        assetAmount.symbol === "wstETH" ? 18 : // wstETH: 18 decimals
                        assetAmount.symbol === "AAVE" ? 18 :   // AAVE: 18 decimals
                        assetAmount.symbol === "EURC" ? 6 :    // EURC: 6 decimals
                        6; // USDC: 6 decimals (default)
        
        // Check for minimum viable amount (avoid dust amounts)
        const amountNum = parseFloat(assetAmount.amount);
        const minimumAmount = Math.pow(10, -decimals) * 10; // 10 units of smallest denomination
        
        if (amountNum < minimumAmount) {
          addOutput(` ⚠️ Skipping ${assetAmount.symbol} - amount too small (${assetAmount.amount})`);
          console.warn(`Skipping supply of ${assetAmount.amount} ${assetAmount.symbol} - amount too small`);
          completedAssets++;
          continue;
        }
        
        try {
          addOutput(`    🔄 Checking balance and preparing approval...`);
        
        // Approve and supply the asset
        await checkAndApproveErc20(
          pub, 
          walletClient, 
          reserve.underlying as Address, 
          cfg.pool as Address, 
          assetAmount.amount, 
          decimals
        );
          
          addOutput(`    🔄 Approval confirmed, executing supply transaction...`);
        
        await supplyToAave(
          pub, 
          walletClient, 
          cfg.pool as Address, 
          reserve.underlying as Address, 
          assetAmount.amount, 
          decimals
        );
        
          addOutput(` ✅ Successfully supplied ${assetAmount.amount} ${assetAmount.symbol} to Aave`);
          
        } catch (error) {
          console.error(`Failed to supply ${assetAmount.symbol}:`, error);
          addOutput(` ❌ Failed to supply ${assetAmount.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new Error(`Failed to supply ${assetAmount.amount} ${assetAmount.symbol} to Aave: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        setStatusProgress(55 + (completedAssets / consolidatedAssetAmounts.length) * 40);
        completedAssets++;
        
        // Add delay between supplies for better UX
        if (completedAssets < consolidatedAssetAmounts.length) {
          addOutput(`    ⏳ Waiting 2 seconds before next supply...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      setStatusProgress(95);
      addOutput("");
      addOutput("=== DEPLOYMENT COMPLETE ===");
      addOutput("🎉 Successfully deployed portfolio using ParaSwap + Aave supply!");
      addOutput("");
      addOutput("📊 Portfolio Summary:");
      
      for (const assetAmount of consolidatedAssetAmounts) {
        addOutput(`  • ${assetAmount.amount} ${assetAmount.symbol} (from ${assetAmount.usdcAmount} USDC)`);
      }
      
      addOutput("");
      addOutput("✅ All steps completed successfully:");
      addOutput("  1. ✅ ParaSwap API connectivity verified");
      addOutput("  2. ✅ USDC swapped to portfolio assets");
      addOutput("  3. ✅ Assets supplied to Aave protocol");
      addOutput("");
      addOutput("💡 Your assets are now earning interest on Aave!");
      
      setStatusType("success");
      setStatusProgress(100);
      
      // Refresh positions to show the new supplies
      await refreshPositions();
      
    } catch (error) {
      console.error("Portfolio deployment error:", error);
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      setStatusType("error");
      addOutput("");
      addOutput(`❌ Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      showErrorNotification(error, "Portfolio Deployment Failed");
    } finally {
      setLoading(false);
    }
  }

  // Helper function to check if user has enough USDC balance
  const checkUSDCBalance = async () => {
    if (!walletAddress || !cfg) return { hasEnough: false, balance: "0", required: "0" };
    
    const usdcReserve = cfg.reserves.USDC;
    if (!usdcReserve) return { hasEnough: false, balance: "0", required: "0" };
    
    const currentBalance = await getTokenBalance(usdcReserve.underlying as Address, walletAddress as Address, 6);
    const requiredAmount = selectedCfg?.initialCapital?.toString() || "0";
    
    return {
      hasEnough: parseFloat(currentBalance) >= parseFloat(requiredAmount),
      balance: currentBalance,
      required: requiredAmount
    };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">Aave DeFi Manager</h1>
            <p className="text-[rgb(var(--fg-secondary))]">Lend, borrow, and manage your DeFi positions</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-[rgb(var(--fg-secondary))]">
              Network: {CHAINS[chainId]?.name || `Chain ${chainId}`}
            </div>
            <button
              onClick={fetchPoolPrices}
              disabled={loading}
              className="btn btn-secondary"
            >
              Refresh Market Data
            </button>


            <button 
              onClick={refreshPositions}
              disabled={loading}
              className="btn btn-secondary"
              title="Refresh positions"
            >
              <IconRefresh size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Error Handler */}
      <AaveErrorHandler
        error={currentError}
        onRetry={() => {
          setCurrentError(null);
          // Retry the last operation
          fetchPoolPrices();
          // Retry the last operation
          fetchPoolPrices();
        }}
        onDismiss={() => setCurrentError(null)}
      />

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b border-[rgb(var(--border-primary))] mb-6">
          <button
            onClick={() => setActiveTab("positions")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "positions"
                ? "text-[rgb(var(--accent-primary))] border-b-2 border-[rgb(var(--accent-primary))]"
                : "text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--fg-primary))]"
            }`}
          >
            <IconWallet size={16} className="inline mr-2" />
            My Positions
          </button>
          <button
            onClick={() => setActiveTab("deploy")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "deploy"
                ? "text-[rgb(var(--accent-primary))] border-b-2 border-[rgb(var(--accent-primary))]"
                : "text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--fg-primary))]"
            }`}
          >
            <IconBuildingBank size={16} className="inline mr-2" />
            Deploy Strategy
          </button>
          <button
            onClick={() => setActiveTab("supply")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "supply"
                ? "text-[rgb(var(--accent-primary))] border-b-2 border-[rgb(var(--accent-primary))]"
                : "text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--fg-primary))]"
            }`}
          >
            Supply Assets
          </button>
          <button
            onClick={() => setActiveTab("rebalance")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "rebalance"
                ? "text-[rgb(var(--accent-primary))] border-b-2 border-[rgb(var(--accent-primary))]"
                : "text-[rgb(var(--fg-secondary))] hover:text-[rgb(var(--fg-primary))]"
            }`}
          >
            Rebalance Portfolio
          </button>
        </div>

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Your Aave Positions</h3>
                <div className="flex items-center gap-3">
                  {(() => {
                    // Debug logging for emergency withdraw button
                    const positionsWithSupply = positions.filter(pos => parseFloat(pos.supplied) > 0);
                    console.log("Positions for emergency withdraw check:", positions);
                    console.log("Positions with supply > 0:", positionsWithSupply);
                    console.log("Should show emergency withdraw:", positions.length > 0 && positions.some(pos => parseFloat(pos.supplied) > 0));
                    
                    return positions.length > 0 && positions.some(pos => parseFloat(pos.supplied) > 0) ? (
                    <button
                      onClick={emergencyWithdrawAll}
                      disabled={loading}
                      className="btn btn-sm btn-warning relative group"
                      title="Emergency Withdraw: Withdraw all supplied assets from Aave"
                    >
                      <IconMinus size={14} />
                      Emergency Withdraw
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                        Withdraw all supplied assets from Aave
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </button>
                    ) : null;
                  })()}
                  <div className={`badge ${walletAddress ? 'badge-success' : 'badge-primary'}`}>
                    {walletAddress ? "Wallet Connected" : "No Wallet"}
                  </div>
                </div>
              </div>
              
              <div className="card mb-4">
                <h4 className="font-semibold mb-4">Account Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))]">Total Supplied</div>
                    <div className="font-semibold">
                      ${userSummary ? userSummary.totalSupplied.toFixed(2) : "0.00"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))]">Total Borrowed</div>
                    <div className="font-semibold">
                      ${userSummary ? userSummary.totalBorrowed.toFixed(2) : "0.00"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))]">Health Factor</div>
                    <div className={`font-semibold ${
                      !userSummary ? "text-gray-400" : 
                      userSummary.healthFactor > 1.5 ? "text-green-400" : 
                      userSummary.healthFactor > 1.1 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {userSummary ? userSummary.healthFactor.toFixed(2) : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))]">LTV</div>
                    <div className="font-semibold">
                      {userSummary ? (userSummary.ltv * 100).toFixed(1) : "0.0"}%
                    </div>
                  </div>
                </div>
                
                {/* Health Factor Status */}
                {userSummary && (
                  <div className="mt-4 p-3 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Health Factor Status</span>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        userSummary.healthFactor > 1.5 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" 
                          : userSummary.healthFactor > 1.1 
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                      }`}>
                        {userSummary.healthFactor > 1.5 ? "Safe" : 
                         userSummary.healthFactor > 1.1 ? "At Risk" : "Danger"}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-[rgb(var(--fg-secondary))]">
                      {userSummary.healthFactor > 1.5 
                        ? "Your position is healthy and safe from liquidation."
                        : userSummary.healthFactor > 1.1 
                        ? "Consider reducing your borrowed amount or adding more collateral."
                        : "Your position is at high risk of liquidation. Please add collateral or repay debt immediately."
                      }
                    </div>
                  </div>
                )}
              </div>
              
              {positions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-primary))]">
                        <th className="text-left py-2 px-2">Asset</th>
                        <th className="text-left py-2 px-2">Supplied (aToken)</th>
                        <th className="text-left py-2 px-2">Borrowed</th>
                        <th className="text-left py-2 px-2">Supply APY</th>
                        <th className="text-left py-2 px-2">Borrow APY</th>
                        <th className="text-left py-2 px-2">USD Value</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => {
                        // Enhanced debug logging for position display
                        const suppliedAmount = parseFloat(pos.supplied);
                        const shouldShowWithdraw = suppliedAmount > 0;
                        console.log(`Rendering position: ${pos.symbol} - Supplied: "${pos.supplied}" (parsed: ${suppliedAmount}) - Should show withdraw: ${shouldShowWithdraw}`);
                        console.log(`Position object:`, pos);
                        
                        return (
                        <tr key={pos.asset} className="border-b border-[rgb(var(--border-primary))]">
                          <td className="py-2 px-2">
                            <span className="font-semibold">{pos.symbol}</span>
                          </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm">
                                  {parseFloat(pos.supplied) < 0.01 ? 
                                    `${parseFloat(pos.supplied).toFixed(8)}` : 
                                    pos.supplied
                                  }
                                </span>
                                {shouldShowWithdraw && (
                                  <span className="text-xs text-green-600">✓</span>
                                )}
                              </div>
                            </td>
                          <td className="py-2 px-2">{pos.borrowed}</td>
                          <td className="py-2 px-2">{pos.supplyAPY}%</td>
                          <td className="py-2 px-2">{pos.borrowAPY}%</td>
                          <td className="py-2 px-2">${pos.usdValue.toFixed(2)}</td>
                          <td className="py-2 px-2">
                            <div className={`badge ${pos.collateral ? 'badge-success' : 'badge-primary'}`}>
                              {pos.collateral ? "Collateral" : "Borrowed"}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                              {shouldShowWithdraw ? (
                              <button
                                  onClick={() => withdrawAsset(pos.symbol, "999999999999999999999999999999")}
                                disabled={loading}
                                className="btn btn-sm btn-secondary"
                                  title={`Withdraw maximum available ${pos.symbol}`}
                              >
                                <IconMinus size={12} />
                                  Withdraw Max
                              </button>
                              ) : (
                                <span className="text-xs text-gray-500">No supply</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card text-center py-8">
                  <p className="text-[rgb(var(--fg-secondary))] mb-2">
                    No active positions found.
                  </p>
                  <p className="text-xs text-[rgb(var(--fg-tertiary))]">
                    {walletAddress 
                      ? "Supply assets to start earning interest or use them as collateral for borrowing."
                      : "Connect your wallet to view your Aave positions and start lending/borrowing."
                    }
                  </p>
                </div>
              )}
            </div>
            
            
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Network Pool Information</h3>
                <div className={`badge ${loading ? 'badge-primary' : poolInfo.length > 0 ? 'badge-success' : ''}`}>
                  {loading ? "Loading..." : poolInfo.length > 0 ? `${poolInfo.length} pools` : "No data"}
                </div>
              </div>
              {loading ? (
                <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
                  Loading market data for {CHAINS[chainId]?.name || `Chain ${chainId}`}...
                </div>
              ) : poolInfo.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-primary))]">
                        <th className="text-left py-2 px-2">Asset</th>
                        <th className="text-left py-2 px-2">Total Supply</th>
                        <th className="text-left py-2 px-2">Total Borrow</th>
                        <th className="text-left py-2 px-2">Supply APY</th>
                        <th className="text-left py-2 px-2">Borrow APY</th>
                        <th className="text-left py-2 px-2">Utilization</th>
                        <th className="text-left py-2 px-2">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolInfo.map((pool) => (
                        <tr key={pool.symbol} className="border-b border-[rgb(var(--border-primary))]">
                          <td className="py-2 px-2">
                            <span className="font-semibold">{pool.symbol}</span>
                          </td>
                          <td className="py-2 px-2">{typeof pool.totalSupply === 'string' ? pool.totalSupply : '0'}</td>
                          <td className="py-2 px-2">{typeof pool.totalBorrow === 'string' ? pool.totalBorrow : '0'}</td>
                          <td className="py-2 px-2">{typeof pool.totalSupply === 'string' ? pool.totalSupply : '0'}</td>
                          <td className="py-2 px-2">{typeof pool.totalBorrow === 'string' ? pool.totalBorrow : '0'}</td>
                          <td className="py-2 px-2">
                            {isNaN(pool.supplyAPY) || pool.supplyAPY === 0 ? 
                              "N/A" : `${pool.supplyAPY.toFixed(2)}%`
                            }
                          </td>
                          <td className="py-2 px-2">
                            {isNaN(pool.borrowAPY) || pool.borrowAPY === 0 ? 
                              "N/A" : `${pool.borrowAPY.toFixed(2)}%`
                            }
                          </td>
                          <td className="py-2 px-2">
                            {isNaN(pool.utilizationRate) || pool.utilizationRate === 0 ? 
                              "N/A" : `${pool.utilizationRate.toFixed(1)}%`
                            }
                          </td>
                          <td className="py-2 px-2">${pool.price.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
                  No market data available for {CHAINS[chainId]?.name || `Chain ${chainId}`}. Click &quot;Refresh Market Data&quot; to fetch current market information.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deploy Tab */}
        {activeTab === "deploy" && (
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Deploy Backtest Strategy</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">
              Deploy your saved portfolio strategy to Aave for real DeFi exposure
            </p>
            
            <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">Asset Mapping</h4>
              <div className="text-xs text-yellow-700 dark:text-yellow-300">
                <div>• Bitcoin (BTC) → cbBTC (Coinbase Bitcoin) on Base</div>
                <div>• Ethereum (ETH) → WETH (Wrapped Ethereum) on Base</div>
                <div>• Other assets map directly to their wrapped versions</div>
              </div>
            </div>
            
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Saved Portfolio</label>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select a portfolio to deploy</option>
                  {Object.keys(portfolios).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              
              {selectedCfg && (
                <div className="card">
                  <h4 className="font-semibold mb-4">Strategy Details</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-[rgb(var(--fg-tertiary))]">Initial Capital</div>
                      <div className="font-semibold">${selectedCfg.initialCapital}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[rgb(var(--fg-tertiary))]">Date Range</div>
                      <div className="font-semibold">{selectedCfg.start} → {selectedCfg.end}</div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <h5 className="font-semibold mb-2">Asset Allocations</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[rgb(var(--border-primary))]">
                            <th className="text-left py-2 px-2">Asset</th>
                            <th className="text-left py-2 px-2">Weight</th>
                            <th className="text-left py-2 px-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCfg.allocations.map((a) => {
                            const sym = mapAssetIdToAaveSymbol(a.id);
                            const ok = sym && supportedAssets.has(sym);
                            return (
                              <tr key={a.id} className="border-b border-[rgb(var(--border-primary))]">
                                <td className="py-2 px-2">{a.id}</td>
                                <td className="py-2 px-2">{(a.allocation * 100).toFixed(2)}%</td>
                                <td className="py-2 px-2">
                                  {ok ? (
                                    <div className="badge badge-success">Supported</div>
                                  ) : (
                                    <div className="badge">Unsupported</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <button 
                    onClick={deployWithAvailableCapital} 
                    disabled={!cfg || loading}
                    className="btn btn-primary w-full"
                  >
                    <IconPlus size={16} />
                    Deploy Strategy
                  </button>
                </div>
              )}
              
            </div>
          </div>
        )}

        {/* Supply Tab */}
        {activeTab === "supply" && (
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Supply Assets</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">
              Supply assets to Aave to earn interest and use as collateral. You&apos;ll receive aTokens (e.g., aUSDC) that represent your supplied assets.
            </p>
            
            <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Supported Assets on Base</h4>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <div>• USDC → aBasUSDC (USD Coin)</div>
                <div>• cbBTC → aBascbBTC (Coinbase Bitcoin)</div>
                <div>• WETH → aBasWETH (Wrapped Ethereum)</div>
                <div>• wstETH → aBaswstETH (Wrapped Staked Ethereum)</div>
                <div>• EURC → aBasEURC (Euro Coin)</div>
                <div>• AAVE → aBasAAVE (Aave Token)</div>
              </div>
            </div>

            {/* In-Wallet Available Assets */}
            {walletAddress && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">In-Wallet Available Assets</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshWalletBalances}
                      disabled={loading}
                      className="btn btn-sm btn-secondary"
                      title="Refresh wallet balances"
                    >
                      <IconRefresh size={14} />
                    </button>
                    {walletBalances.length > 0 && (
                      <>
                        <button
                          onClick={swapAllAssetsToUSDC}
                          disabled={loading}
                          className="btn btn-sm btn-secondary"
                          title="Swap all available assets to USDC"
                        >
                          <IconArrowsExchange size={14} className="mr-1" />
                          Swap All to USDC
                        </button>
                        <button
                          onClick={supplyAllAvailableAssets}
                          disabled={loading}
                          className="btn btn-sm btn-primary"
                          title="Supply all available assets to Aave"
                        >
                          <IconPlus size={14} className="mr-1" />
                          Supply All
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                {walletBalances.length > 0 ? (
                  <div className="space-y-3">
                    {walletBalances.map((asset, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-[rgb(var(--accent-primary))] rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-white">
                              {asset.symbol.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-[rgb(var(--fg-primary))]">{asset.symbol}</div>
                            <div className="text-sm text-[rgb(var(--fg-secondary))]">
                              Balance: {parseFloat(asset.balance).toFixed(6)} {asset.symbol}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedAsset(asset.symbol);
                            setSupplyAmount(asset.balance);
                          }}
                          disabled={loading}
                          className="btn btn-sm btn-primary"
                          title={`Supply ${asset.balance} ${asset.symbol} to Aave`}
                        >
                          <IconPlus size={12} className="mr-1" />
                          Supply
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
                    <IconWallet size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No supported assets found in your wallet</p>
                    <p className="text-xs mt-1">Make sure you have USDC, cbBTC, WETH, wstETH, EURC, or AAVE tokens</p>
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Asset</label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select asset to supply</option>
                  {Object.keys(cfg?.reserves || {}).map((sym) => (
                    <option key={sym} value={sym}>{sym}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Amount</label>
                <input
                  type="number"
                  value={supplyAmount}
                  onChange={(e) => setSupplyAmount(e.target.value)}
                  placeholder="0.00"
                  min={0}
                  step="0.000001"
                  className="input w-full"
                />
              </div>
            </div>
            
            <button 
              onClick={supplyAsset}
              disabled={!selectedAsset || !supplyAmount || loading}
              className="btn btn-primary w-full"
            >
              <IconPlus size={16} />
              Supply Asset
            </button>
            
          </div>
        )}

        {/* Rebalance Tab */}
        {activeTab === "rebalance" && (
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Rebalance Portfolio</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))] mb-4">
              Rebalance your Aave positions and wallet assets to match a target portfolio allocation. This feature analyzes your current holdings and suggests actions to achieve your desired asset allocation.
            </p>
            
            {/* Target Portfolio Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">
                Select Target Portfolio for Rebalancing
              </label>
              <select
                value={rebalanceTargetPortfolio}
                onChange={(e) => setRebalanceTargetPortfolio(e.target.value)}
                className="input w-full"
              >
                <option value="">Choose a target portfolio...</option>
                {Object.keys(portfolios).map((portfolioName) => (
                  <option key={portfolioName} value={portfolioName}>
                    {portfolioName}
                  </option>
                ))}
              </select>
            </div>

            {/* Portfolio Selection Status */}
            {rebalanceTargetPortfolio && portfolios[rebalanceTargetPortfolio] ? (
              <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Target Portfolio Selected</h4>
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <div className="font-medium mb-1">Portfolio: {rebalanceTargetPortfolio}</div>
                  <div className="space-y-1">
                    {portfolios[rebalanceTargetPortfolio].allocations.map((allocation, index) => (
                      <div key={index}>• {allocation.id}: {allocation.allocation}%</div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ No Target Portfolio Selected</h4>
                <div className="text-xs text-yellow-700 dark:text-yellow-300">
                  <div>Please select a target portfolio from the dropdown above.</div>
                  <div>The rebalancing will use that portfolio as the target allocation.</div>
                </div>
              </div>
            )}
            
            <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">How Rebalancing Works</h4>
              <div className="text-xs text-green-700 dark:text-green-300">
                <div>• Analyzes your current Aave positions + wallet balances</div>
                <div>• Compares against target portfolio allocation</div>
                <div>• Suggests supply/withdraw actions to rebalance</div>
                <div>• Executes actions to achieve target allocation</div>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={calculateRebalancing}
                disabled={loading || !walletAddress || !rebalanceTargetPortfolio || !portfolios[rebalanceTargetPortfolio]}
                className="btn btn-primary w-full"
              >
                <IconRefresh size={16} className="mr-2" />
                Calculate Rebalancing
              </button>

              {rebalancingData && (
                <div className="space-y-4">
                  <div className="p-4 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))]">
                    <h4 className="font-semibold mb-2">Portfolio Summary</h4>
                    <div className="text-sm">
                      <div>Total Value: ${rebalancingData.totalValue.toFixed(2)}</div>
                      <div>Rebalancing Actions: {rebalancingData.rebalancingActions.length}</div>
                    </div>
                  </div>

                  {rebalancingData.rebalancingActions.length > 0 && (
                    <div className="p-4 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))]">
                      <h4 className="font-semibold mb-2">Rebalancing Actions</h4>
                      <div className="space-y-2">
                        {rebalancingData.rebalancingActions.map((action, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-[rgb(var(--bg-tertiary))] rounded">
                            <div>
                              <div className="font-medium text-sm">
                                {action.type.toUpperCase()}: {action.amount.toFixed(6)} {action.fromSymbol}
                              </div>
                              <div className="text-xs text-[rgb(var(--fg-secondary))]">
                                {action.reason}
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-medium ${
                              action.type === 'supply' 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                : action.type === 'withdraw'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                                : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                            }`}>
                              {action.type}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rebalancingData.rebalancingActions.length > 0 && (
                    <button
                      onClick={executeRebalancing}
                      disabled={loading}
                      className="btn btn-success w-full"
                    >
                      <IconArrowsExchange size={16} className="mr-2" />
                      Execute Rebalancing
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Capital Confirmation Dialog */}
      {showCapitalConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-primary))] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Insufficient Capital</h3>
            <div className="mb-4">
              <p className="text-[rgb(var(--fg-secondary))] mb-2">
                Your portfolio requires <strong>${requestedCapital} USDC</strong>, but you only have <strong>${availableCapital} USDC</strong>.
              </p>
              <p className="text-[rgb(var(--fg-secondary))]">
                Would you like to deploy the portfolio with your available capital instead? The allocations will be scaled proportionally.
              </p>
            </div>
            
            <div className="mb-4 p-3 bg-[rgb(var(--bg-secondary))] rounded">
              <h4 className="font-medium mb-2">Deployment with Available Capital:</h4>
              <div className="text-sm text-[rgb(var(--fg-secondary))]">
                <div>Available: ${availableCapital} USDC</div>
                <div>Requested: ${requestedCapital} USDC</div>
                <div>Scale Factor: {(parseFloat(availableCapital) / parseFloat(requestedCapital) * 100).toFixed(1)}%</div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowCapitalConfirmation(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={deployWithAvailableCapital}
                className="btn btn-primary flex-1"
              >
                Deploy with Available Capital
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Operation Output Modal */}
      {isOutputModalOpen && (
        <div className={`fixed z-50 transition-all duration-300 ${
          isOutputModalMinimized ? 'bottom-4 right-4' : 'bottom-4 right-4 top-4'
        }`}>
          <div className={`bg-[rgb(var(--bg-primary))] border border-[rgb(var(--border-primary))] rounded-lg shadow-2xl transition-all duration-300 ${
            isOutputModalMinimized ? 'w-80 h-12' : 'w-96 max-h-[calc(100vh-2rem)]'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between border-b border-[rgb(var(--border-primary))] transition-all duration-300 ${
              isOutputModalMinimized ? 'p-2' : 'p-3'
            }`}>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Status Indicator */}
                {(status || operationProgress || loading) && (
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    statusType === "success" ? "bg-green-500" :
                    statusType === "error" ? "bg-red-500" :
                    statusType === "warning" ? "bg-yellow-500" :
                    (operationProgress || loading) ? "bg-blue-500 animate-pulse" :
                    "bg-gray-500"
                  }`}></div>
                )}
                
                <h4 className={`font-semibold text-[rgb(var(--fg-primary))] transition-all duration-300 ${
                  isOutputModalMinimized ? 'text-xs' : 'text-sm'
                }`}>Operation Output</h4>
                
                {/* Status Badge */}
                {status && (
                  <span className={`badge transition-all duration-300 ${
                    isOutputModalMinimized ? 'badge-xs text-xs px-1 py-0' : 'badge-sm'
                  } ${
                    statusType === "success" ? "badge-success" :
                    statusType === "error" ? "badge-error" :
                    statusType === "warning" ? "badge-warning" :
                    "badge-primary"
                  }`}>
                    {statusType.toUpperCase()}
                  </span>
                )}
                
                {/* Output Count Badge */}
                {operationOutput.length > 0 && !status && (
                  <span className={`badge badge-primary transition-all duration-300 ${
                    isOutputModalMinimized ? 'badge-xs text-xs px-1 py-0' : 'badge-sm'
                  }`}>{operationOutput.length}</span>
                )}
                
                {/* Active Operation Indicator */}
                {(operationProgress || loading) && (
                  <span className={`badge transition-all duration-300 ${
                    isOutputModalMinimized ? 'badge-xs text-xs px-1 py-0' : 'badge-sm'
                  } badge-info animate-pulse`}>
                    {loading ? "ACTIVE" : "PROGRESS"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsOutputModalMinimized(!isOutputModalMinimized)}
                  className={`btn btn-ghost transition-all duration-300 ${
                    isOutputModalMinimized ? 'btn-xs' : 'btn-xs'
                  }`}
                  title={isOutputModalMinimized ? "Expand" : "Minimize"}
                >
                  {isOutputModalMinimized ? <IconMaximize size={12} /> : <IconMinimize size={12} />}
                </button>
                <button
                  onClick={clearOutput}
                  className={`btn btn-ghost transition-all duration-300 ${
                    isOutputModalMinimized ? 'btn-xs' : 'btn-xs'
                  }`}
                  title="Clear output"
                >
                  <IconRefresh size={12} />
                </button>
                <button
                  onClick={() => setIsOutputModalOpen(false)}
                  className={`btn btn-ghost transition-all duration-300 ${
                    isOutputModalMinimized ? 'btn-xs' : 'btn-xs'
                  }`}
                  title="Close"
                >
                  <IconX size={12} />
                </button>
              </div>
            </div>

            {/* Progress Bar - Always Visible */}
            {(operationProgress || statusProgress !== undefined || loading) && (
              <div className={`border-b border-[rgb(var(--border-primary))] transition-all duration-300 ${
                isOutputModalMinimized ? 'p-2' : 'p-3'
              }`}>
                <div className={`flex items-center justify-between mb-1 ${
                  isOutputModalMinimized ? 'text-xs' : 'text-sm'
                }`}>
                  <span className="font-medium text-[rgb(var(--fg-primary))] truncate">
                    {operationProgress?.currentStep || 
                     (loading && "Operation in progress...") ||
                     (status && "Operation in progress...") ||
                     "Processing..."}
                  </span>
                  <span className="text-[rgb(var(--fg-secondary))] flex-shrink-0 ml-2">
                    {operationProgress ? 
                      `${operationProgress.current}/${operationProgress.total}` : 
                      statusProgress !== undefined ? `${Math.round(statusProgress)}%` :
                      loading ? "..." : ''
                    }
                  </span>
                </div>
                <div className={`w-full bg-[rgb(var(--bg-secondary))] rounded-full ${
                  isOutputModalMinimized ? 'h-1' : 'h-2'
                }`}>
                  <div 
                    className={`rounded-full transition-all duration-300 ease-out ${
                      isOutputModalMinimized ? 'h-1' : 'h-2'
                    } ${
                      statusType === "success" ? "bg-green-500" :
                      statusType === "error" ? "bg-red-500" :
                      statusType === "warning" ? "bg-yellow-500" :
                      loading ? "bg-blue-500 animate-pulse" :
                      "bg-blue-500"
                    }`}
                    style={{ 
                      width: operationProgress ? 
                        `${(operationProgress.current / operationProgress.total) * 100}%` :
                        statusProgress !== undefined ? `${statusProgress}%` : 
                        loading ? '100%' : '0%'
                    }}
                  ></div>
                </div>
                {!isOutputModalMinimized && (
                  <div className="mt-1 text-xs text-[rgb(var(--fg-secondary))]">
                    {operationProgress ? 
                      `${Math.round((operationProgress.current / operationProgress.total) * 100)}% Complete` :
                      statusProgress !== undefined ? `${Math.round(statusProgress)}% Complete` : ''
                    }
                  </div>
                )}
              </div>
            )}

            {/* Modal Content */}
            {!isOutputModalMinimized && (
              <div className="p-3 flex flex-col min-h-0 flex-1">
                {/* Status Display */}
                {status && (
                  <div className="mb-3 p-3 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))] flex-shrink-0">
                    <div className="text-sm text-[rgb(var(--fg-primary))] whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                      {status}
                    </div>
                  </div>
                )}
                
                {/* Output Log */}
                <div className="flex-1 bg-[rgb(var(--bg-secondary))] rounded-lg border border-[rgb(var(--border-primary))] p-3 overflow-y-auto min-h-0">
                  <div className="space-y-1">
                    {operationOutput.length === 0 ? (
                      <div className="text-xs text-[rgb(var(--fg-secondary))] text-center py-4">
                        No operation output yet
                      </div>
                    ) : (
                      operationOutput.map((line, index) => (
                        <div key={index} className="text-xs font-mono text-[rgb(var(--fg-secondary))] leading-relaxed break-words">
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Button to Open Modal */}
      {operationOutput.length > 0 && !isOutputModalOpen && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            onClick={() => setIsOutputModalOpen(true)}
            className={`btn btn-circle shadow-lg hover:shadow-xl transition-all duration-200 ${
              (operationProgress || loading) ? 'btn-info animate-pulse' : 'btn-primary'
            }`}
            title="View Operation Output"
          >
            <div className="relative">
              <IconRefresh size={20} />
              {operationOutput.length > 0 && (
                <span className={`absolute -top-1 -right-1 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center ${
                  (operationProgress || loading) ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                }`}>
                  {operationOutput.length}
                </span>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}