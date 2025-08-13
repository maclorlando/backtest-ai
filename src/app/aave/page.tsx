"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Text, Button, Select, Tabs, Table, Badge, Group, Grid, NumberInput, ActionIcon, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRefresh, IconPlus, IconMinus, IconWallet, IconBuildingBank } from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig, mapAssetIdToAaveSymbol } from "@/lib/aave/config";
import { buildPublicClient, buildPublicClientWithFallback, buildWalletClient } from "@/lib/wallet/viem";
import { loadWallet } from "@/lib/wallet/storage";
import { checkAndApproveErc20, supplyToAave, testAaveConnection, getPoolInfo, getUserPositions, supplyAssetWithSDK, borrowAssetWithSDK } from "@/lib/aave/viem";
import { getSupportedNetworks, fetchAllPoolData } from "@/lib/aave/poolData";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation } from "@/lib/utils/errorHandling";
import { AaveErrorHandler, parseAaveError, type AaveErrorInfo } from "@/components/AaveErrorHandler";
import type { AssetId, AavePoolInfo, AaveUserPosition, AaveUserSummary } from "@/lib/types";
import { Address, formatEther, parseEther } from "viem";
import { readErc20Balance } from "@/lib/evm/erc20";
import StatusCard, { StatusType } from "@/components/StatusCard";
import { useApp } from "@/lib/context/AppContext";

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
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [supplyAmount, setSupplyAmount] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
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

  async function testConnection() {
    try {
      setConnectionStatus("testing");
      setLoading(true);
      showInfoNotification(
        "Testing connection to Aave...",
        "Testing"
      );
      
      const isConnected = await retryOperation(
        () => testAaveConnection(),
        3, // max retries
        1000 // delay
      );
      
      if (isConnected) {
        setConnectionStatus("connected");
        showSuccessNotification(
          "Successfully connected to Aave",
          "Connection Successful"
        );
      } else {
        setConnectionStatus("disconnected");
        showErrorNotification(
          new Error("Failed to connect to Aave"),
          "Connection Failed"
        );
      }
    } catch (error) {
      setConnectionStatus("disconnected");
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Connection Test Failed");
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
        "Fetching pool prices and information...",
        "Fetching"
      );
      
      // Use the new market data function to fetch all pool data at once
      const poolData = await retryOperation(
        () => fetchAllPoolData(chainId),
        3, // max retries
        1000 // delay
      );
      
      setPoolInfo(poolData);
      showSuccessNotification(
        `Fetched information for ${poolData.length} pools`,
        "Pool Data Updated"
      );
    } catch (error) {
      const aaveError = parseAaveError(error, { chainId });
      setCurrentError(aaveError);
      showErrorNotification(error, "Failed to fetch pool data");
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
    <main className="space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="center">
          <div>
            <Text size="lg" fw={700}>Aave DeFi Manager</Text>
            <Text size="sm" c="dimmed">Lend, borrow, and manage your DeFi positions</Text>
          </div>
                     <Group>
            <Text size="sm" c="dimmed">
              Network: {CHAINS[chainId]?.name || `Chain ${chainId}`}
            </Text>
            <Button
              variant="light"
              onClick={getNetworkStats}
              loading={loading}
              size="sm"
            >
              Get Network Stats
            </Button>
            <Tooltip label="Refresh positions">
              <ActionIcon 
                variant="light" 
                onClick={refreshPositions}
                loading={loading}
                size="lg"
              >
                <IconRefresh size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      {/* Error Handler */}
      <AaveErrorHandler
        error={currentError}
        onRetry={() => {
          setCurrentError(null);
          // Retry the last operation based on context
          if (connectionStatus === "testing") {
            testConnection();
          } else {
            fetchPoolPrices();
          }
        }}
        onDismiss={() => setCurrentError(null)}
      />

      <Tabs defaultValue="positions">
        <Tabs.List>
          <Tabs.Tab value="positions" leftSection={<IconWallet size={16} />}>
            My Positions
          </Tabs.Tab>
          <Tabs.Tab value="deploy" leftSection={<IconBuildingBank size={16} />}>
            Deploy Strategy
          </Tabs.Tab>
          <Tabs.Tab value="supply">
            Supply Assets
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="positions" pt="md">
          <Grid>
            <Grid.Col span={12}>
              <Card withBorder shadow="sm" padding="lg">
                <Group justify="space-between" align="center" mb="md">
                  <Text size="md" fw={600}>Your Aave Positions</Text>
                  <Badge color={walletAddress ? "green" : "red"}>
                    {walletAddress ? "Wallet Connected" : "No Wallet"}
                  </Badge>
                </Group>
                
                <Card withBorder shadow="sm" padding="md" mb="md">
                  <Text size="sm" fw={600} mb="md">Account Summary</Text>
                  <Grid>
                    <Grid.Col span={3}>
                      <Text size="xs" c="dimmed">Total Supplied</Text>
                      <Text size="sm" fw={600}>
                        ${userSummary ? userSummary.totalSupplied.toFixed(2) : "0.00"}
                      </Text>
                    </Grid.Col>
                    <Grid.Col span={3}>
                      <Text size="xs" c="dimmed">Total Borrowed</Text>
                      <Text size="sm" fw={600}>
                        ${userSummary ? userSummary.totalBorrowed.toFixed(2) : "0.00"}
                      </Text>
                    </Grid.Col>
                    <Grid.Col span={3}>
                      <Text size="xs" c="dimmed">Health Factor</Text>
                      <Text size="sm" fw={600} color={
                        !userSummary ? "gray" : 
                        userSummary.healthFactor > 1.5 ? "green" : 
                        userSummary.healthFactor > 1.1 ? "orange" : "red"
                      }>
                        {userSummary ? userSummary.healthFactor.toFixed(2) : "N/A"}
                      </Text>
                    </Grid.Col>
                    <Grid.Col span={3}>
                      <Text size="xs" c="dimmed">LTV</Text>
                      <Text size="sm" fw={600}>
                        {userSummary ? (userSummary.ltv * 100).toFixed(1) : "0.0"}%
                      </Text>
                    </Grid.Col>
                  </Grid>
                </Card>
                
                {positions.length > 0 ? (
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Asset</Table.Th>
                        <Table.Th>Supplied</Table.Th>
                        <Table.Th>Borrowed</Table.Th>
                        <Table.Th>Supply APY</Table.Th>
                        <Table.Th>Borrow APY</Table.Th>
                        <Table.Th>USD Value</Table.Th>
                        <Table.Th>Status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {positions.map((pos) => (
                        <Table.Tr key={pos.asset}>
                          <Table.Td>
                            <Group gap="xs">
                              <Text fw={600}>{pos.symbol}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>{pos.supplied}</Table.Td>
                          <Table.Td>{pos.borrowed}</Table.Td>
                          <Table.Td>{pos.supplyAPY}%</Table.Td>
                          <Table.Td>{pos.borrowAPY}%</Table.Td>
                          <Table.Td>${pos.usdValue.toFixed(2)}</Table.Td>
                          <Table.Td>
                            <Badge color={pos.collateral ? "green" : "blue"}>
                              {pos.collateral ? "Collateral" : "Borrowed"}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Card withBorder shadow="sm" padding="md">
                    <Text size="sm" c="dimmed" ta="center" mb="md">
                      No active positions found.
                    </Text>
                    <Text size="xs" c="dimmed" ta="center">
                      {walletAddress 
                        ? "Supply assets to start earning interest or use them as collateral for borrowing."
                        : "Connect your wallet to view your Aave positions and start lending/borrowing."
                      }
                    </Text>
                  </Card>
                )}
              </Card>
            </Grid.Col>
            
            <Grid.Col span={12}>
              <Card withBorder shadow="sm" padding="lg">
                <Group justify="space-between" align="center" mb="md">
                  <Text size="md" fw={600}>Network Pool Information</Text>
                  <Badge color={poolInfo.length > 0 ? "green" : "gray"}>
                    {poolInfo.length > 0 ? `${poolInfo.length} pools` : "No data"}
                  </Badge>
                </Group>
                {poolInfo.length > 0 ? (
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Asset</Table.Th>
                        <Table.Th>Total Supply</Table.Th>
                        <Table.Th>Total Borrow</Table.Th>
                        <Table.Th>Supply APY</Table.Th>
                        <Table.Th>Borrow APY</Table.Th>
                        <Table.Th>Utilization</Table.Th>
                        <Table.Th>Price</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {poolInfo.map((pool) => (
                        <Table.Tr key={pool.symbol}>
                          <Table.Td>
                            <Text fw={600}>{pool.symbol}</Text>
                          </Table.Td>
                          <Table.Td>{pool.totalSupply}</Table.Td>
                          <Table.Td>{pool.totalBorrow}</Table.Td>
                          <Table.Td>{pool.supplyAPY.toFixed(2)}%</Table.Td>
                          <Table.Td>{pool.borrowAPY.toFixed(2)}%</Table.Td>
                          <Table.Td>{pool.utilizationRate.toFixed(1)}%</Table.Td>
                          <Table.Td>${pool.price.toFixed(4)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    No pool data available. Click "Get Network Stats" to fetch current market information.
                  </Text>
                )}
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        <Tabs.Panel value="deploy" pt="md">
          <Card withBorder shadow="sm" padding="lg">
            <Text size="md" fw={600} mb="md">Deploy Backtest Strategy</Text>
            <Text size="sm" c="dimmed" mb="lg">
              Deploy your saved portfolio strategy to Aave for real DeFi exposure
            </Text>
            
            <Select
              label="Saved Portfolio"
              value={selected}
              onChange={(v) => setSelected(v || "")}
              data={Object.keys(portfolios).map((k) => ({ value: k, label: k }))}
              placeholder="Select a portfolio to deploy"
            />
            
            {selectedCfg && (
              <Card withBorder shadow="sm" padding="md" mt="md">
                <Text size="sm" fw={600} mb="md">Strategy Details</Text>
                <Grid>
                  <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Initial Capital</Text>
                    <Text size="sm" fw={600}>${selectedCfg.initialCapital}</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Date Range</Text>
                    <Text size="sm" fw={600}>{selectedCfg.start} → {selectedCfg.end}</Text>
                  </Grid.Col>
                </Grid>
                
                <Text size="sm" fw={600} mt="md" mb="xs">Asset Allocations</Text>
                <Table withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Asset</Table.Th>
                      <Table.Th>Weight</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedCfg.allocations.map((a) => {
                      const sym = mapAssetIdToAaveSymbol(a.id);
                      const ok = sym && supportedAssets.has(sym);
                      return (
                        <Table.Tr key={a.id}>
                          <Table.Td>{a.id}</Table.Td>
                          <Table.Td>{(a.allocation * 100).toFixed(2)}%</Table.Td>
                          <Table.Td>
                            {ok ? (
                              <Badge color="green" size="xs">Supported</Badge>
                            ) : (
                              <Badge color="red" size="xs">Unsupported</Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
                
                <Button 
                  mt="md" 
                  onClick={deploy} 
                  disabled={!cfg || loading}
                  loading={loading}
                  leftSection={<IconPlus size={16} />}
                  fullWidth
                >
                  Deploy Strategy
                </Button>
              </Card>
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
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="supply" pt="md">
          <Card withBorder shadow="sm" padding="lg">
            <Text size="md" fw={600} mb="md">Supply Assets</Text>
            <Text size="sm" c="dimmed" mb="lg">
              Supply assets to Aave to earn interest and use as collateral
            </Text>
            
            <Grid>
              <Grid.Col span={6}>
                <Select
                  label="Asset"
                  value={selectedAsset}
                  onChange={(v) => setSelectedAsset(v || "")}
                  data={Object.keys(cfg?.reserves || {}).map((sym) => ({ 
                    value: sym, 
                    label: sym 
                  }))}
                  placeholder="Select asset to supply"
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="Amount"
                  value={supplyAmount}
                  onChange={(v) => setSupplyAmount(String(v || ""))}
                  placeholder="0.00"
                  min={0}
                  decimalScale={6}
                />
              </Grid.Col>
            </Grid>
            
            <Button 
              mt="md" 
              onClick={supplyAsset}
              disabled={!selectedAsset || !supplyAmount || loading}
              loading={loading}
              leftSection={<IconPlus size={16} />}
              fullWidth
            >
              Supply Asset
            </Button>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}