"use client";
import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconPlus, IconMinus, IconWallet, IconBuildingBank } from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig, mapAssetIdToAaveSymbol } from "@/lib/aave/config";
import { buildPublicClient, buildPublicClientWithFallback, buildWalletClient } from "@/lib/wallet/viem";
import { loadWallet } from "@/lib/wallet/storage";
import { checkAndApproveErc20, supplyToAave, getPoolInfo, getUserPositions, supplyAssetWithSDK, borrowAssetWithSDK } from "@/lib/aave/viem";
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
  const { currentNetwork } = useApp();
  const chainId = currentNetwork;
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
  const [activeTab, setActiveTab] = useState<"positions" | "deploy" | "supply">("positions");
  const { currentWallet } = useApp();
  const walletAddress = currentWallet;
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

  async function deploy() {
    setLoading(true);
    setStatus("");
    setStatusType("info");
    setStatusProgress(0);
    
    if (!cfg) { 
      setStatus("Aave not supported on this chain yet"); 
      setStatusType("error");
      setLoading(false);
      return; 
    }
    if (!selectedCfg) { 
      setStatus("Select a portfolio"); 
      setStatusType("warning");
      setLoading(false);
      return; 
    }
    if (validation && validation.unsupported.length > 0) { 
      setStatus(`Unsupported assets: ${validation.unsupported.join(", ")}`); 
      setStatusType("warning");
      setLoading(false);
      return; 
    }

    const w = loadWallet();
    if (!w) { 
      setStatus("Unlock or create a wallet in the Wallet page first"); 
      setStatusType("error");
      setLoading(false);
      return; 
    }
    const password = prompt("Enter wallet password to sign");
    if (!password) {
      setLoading(false);
      return;
    }
    
    try {
      const { decryptSecret } = await import("@/lib/wallet/crypto");
      const pk = (await decryptSecret(w.encrypted, password)) as `0x${string}`;
      const pub = buildPublicClientWithFallback(chain, rpc);
      const wc = buildWalletClient(chain, pk, rpc);

      setStatus("Starting deployment process...");
      setStatusType("loading");
      setStatusProgress(10);

      const totalAssets = selectedCfg.allocations.length;
      let completedAssets = 0;

      for (const a of selectedCfg.allocations) {
        const sym = mapAssetIdToAaveSymbol(a.id)!;
        const reserve = cfg.reserves[sym];
        if (!reserve) continue;
        const initialCapital = Number(selectedCfg.initialCapital || 0);
        const isUSDC = sym === "USDC";
        if (!isUSDC) {
          setStatus((s) => s + `\nSkipping ${sym} supply (swap not implemented)`);
          completedAssets++;
          setStatusProgress((completedAssets / totalAssets) * 90 + 10);
          continue;
        }
        const amount = (initialCapital * a.allocation).toFixed(6);
        
        try {
          setStatus((s) => s + `\nProcessing ${sym}...`);
          // Use enhanced approval function that checks allowance first
          await checkAndApproveErc20(pub, wc, reserve.underlying as Address, cfg.pool as Address, amount, 6);
          await supplyToAave(pub, wc, cfg.pool as Address, reserve.underlying as Address, amount, 6);
          setStatus((s) => s + `\nSupplied ${amount} ${sym}`);
          completedAssets++;
          setStatusProgress((completedAssets / totalAssets) * 90 + 10);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          setStatus((s) => s + `\nFailed to supply ${sym}: ${errorMsg}`);
          setStatusType("warning");
          showErrorNotification(error, `Supply Failed for ${sym}`);
          // Continue with other assets even if one fails
          completedAssets++;
          setStatusProgress((completedAssets / totalAssets) * 90 + 10);
        }
      }
      setStatus((s) => s + `\nDeployment completed.`);
      setStatusType("success");
      setStatusProgress(100);
      showSuccessNotification(
        "Portfolio deployment completed",
        "Deployment Successful"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
      setStatusType("error");
      showErrorNotification(e, "Deployment Failed");
    } finally {
      setLoading(false);
    }
  }



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
    } finally {
      setLoading(false);
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
      
      setPositions(userPositions);
      setUserSummary(summary);
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

  async function supplyAsset() {
    if (!selectedAsset || !supplyAmount) return;
    
    const w = loadWallet();
    if (!w) {
      showErrorNotification(
        new Error("Please unlock your wallet first"),
        "Wallet Required"
      );
      return;
    }

    const password = prompt("Enter wallet password to sign");
    if (!password) {
      return;
    }

    try {
      setLoading(true);
      showInfoNotification(
        `Preparing to supply ${supplyAmount} ${selectedAsset}...`,
        "Supply Started"
      );
      
      // Decrypt wallet and create wallet client
      const { decryptSecret } = await import("@/lib/wallet/crypto");
      const pk = (await decryptSecret(w.encrypted, password)) as `0x${string}`;
      const wc = buildWalletClient(chain, pk, rpc);
      
      // Get asset address from config
      const assetAddress = cfg?.reserves[selectedAsset]?.underlying as Address;
      if (!assetAddress) {
        throw new Error(`Asset ${selectedAsset} not found in Aave config`);
      }
      
      // Supply using SDK
      await supplyAssetWithSDK(wc, chainId, assetAddress, supplyAmount);
      
      showSuccessNotification(
        `Successfully supplied ${supplyAmount} ${selectedAsset} to Aave`,
        "Supply Successful"
      );
      setSupplyAmount("");
      setSelectedAsset("");
      
      // Refresh positions after supply
      setTimeout(() => refreshPositions(), 2000);
    } catch (error) {
      const aaveError = parseAaveError(error, { asset: selectedAsset, chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Supply Failed");
    } finally {
      setLoading(false);
    }
  }

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
        </div>

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Your Aave Positions</h3>
                <div className={`badge ${walletAddress ? 'badge-success' : 'badge-primary'}`}>
                  {walletAddress ? "Wallet Connected" : "No Wallet"}
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
              </div>
              
              {positions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-primary))]">
                        <th className="text-left py-2 px-2">Asset</th>
                        <th className="text-left py-2 px-2">Supplied</th>
                        <th className="text-left py-2 px-2">Borrowed</th>
                        <th className="text-left py-2 px-2">Supply APY</th>
                        <th className="text-left py-2 px-2">Borrow APY</th>
                        <th className="text-left py-2 px-2">USD Value</th>
                        <th className="text-left py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos) => (
                        <tr key={pos.asset} className="border-b border-[rgb(var(--border-primary))]">
                          <td className="py-2 px-2">
                            <span className="font-semibold">{pos.symbol}</span>
                          </td>
                          <td className="py-2 px-2">{pos.supplied}</td>
                          <td className="py-2 px-2">{pos.borrowed}</td>
                          <td className="py-2 px-2">{pos.supplyAPY}%</td>
                          <td className="py-2 px-2">{pos.borrowAPY}%</td>
                          <td className="py-2 px-2">${pos.usdValue.toFixed(2)}</td>
                          <td className="py-2 px-2">
                            <div className={`badge ${pos.collateral ? 'badge-success' : 'badge-primary'}`}>
                              {pos.collateral ? "Collateral" : "Borrowed"}
                            </div>
                          </td>
                        </tr>
                      ))}
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
                  No market data available for {CHAINS[chainId]?.name || `Chain ${chainId}`}. Click "Refresh Market Data" to fetch current market information.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deploy Tab */}
        {activeTab === "deploy" && (
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Deploy Backtest Strategy</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))] mb-6">
              Deploy your saved portfolio strategy to Aave for real DeFi exposure
            </p>
            
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
                    onClick={deploy} 
                    disabled={!cfg || loading}
                    className="btn btn-primary w-full"
                  >
                    <IconPlus size={16} />
                    Deploy Strategy
                  </button>
                </div>
              )}
              
              {status && (
                <StatusCard
                  type={statusType}
                  title="Deployment Status"
                  message={status}
                  progress={statusProgress}
                  onClose={() => {
                    setStatus("");
                    setStatusType("info");
                    setStatusProgress(undefined);
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Supply Tab */}
        {activeTab === "supply" && (
          <div className="card">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Supply Assets</h3>
            <p className="text-sm text-[rgb(var(--fg-secondary))] mb-6">
              Supply assets to Aave to earn interest and use as collateral
            </p>
            
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
      </div>
    </div>
  );
}