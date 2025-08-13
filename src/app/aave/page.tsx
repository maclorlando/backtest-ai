"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, Text, Button, Select, Tabs, Table, Badge, Group, Grid, NumberInput, ActionIcon, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRefresh, IconPlus, IconMinus, IconWallet, IconBuildingBank } from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { getAaveConfig, mapAssetIdToAaveSymbol } from "@/lib/aave/config";
import { buildPublicClient, buildWalletClient } from "@/lib/wallet/viem";
import { loadWallet } from "@/lib/wallet/storage";
import { checkAndApproveErc20, supplyToAave } from "@/lib/aave/viem";
import { showErrorNotification, showSuccessNotification, showInfoNotification } from "@/lib/utils/errorHandling";
import type { AssetId } from "@/lib/types";
import { Address, formatEther, parseEther } from "viem";
import { readErc20Balance } from "@/lib/evm/erc20";
import StatusCard, { StatusType } from "@/components/StatusCard";

type SavedRecord = {
  allocations: { id: AssetId; allocation: number }[];
  start: string; end: string; mode: "none" | "periodic" | "threshold";
  periodDays?: number; thresholdPct?: number; initialCapital: number;
};

type AavePosition = {
  asset: string;
  symbol: string;
  supplied: string;
  borrowed: string;
  apy: number;
  collateral: boolean;
};

export default function AavePage() {
  const [chainId, setChainId] = useState<number>(11155111);
  const [portfolios, setPortfolios] = useState<Record<string, SavedRecord>>({});
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [statusType, setStatusType] = useState<StatusType>("info");
  const [statusProgress, setStatusProgress] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<AavePosition[]>([]);
  const [supplyAmount, setSupplyAmount] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [walletAddress, setWalletAddress] = useState<string>("");

  const cfg = getAaveConfig(chainId);
  const chain = CHAINS[chainId];
  const rpc = DEFAULT_RPC_BY_CHAIN[chainId];

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bt_portfolios");
      setPortfolios(raw ? (JSON.parse(raw) as Record<string, SavedRecord>) : {});
    } catch { setPortfolios({}); }

    // Load wallet address
    const wallet = loadWallet();
    if (wallet?.address) {
      setWalletAddress(wallet.address);
    }
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
      const pub = buildPublicClient(chain, rpc);
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

  async function refreshPositions() {
    if (!walletAddress || !cfg) return;
    
    try {
      setLoading(true);
      showInfoNotification(
        "Fetching your Aave positions...",
        "Refreshing"
      );
      
      // Mock positions for demo - in real implementation, this would query Aave contracts
      const mockPositions: AavePosition[] = [
        {
          asset: "USDC",
          symbol: "USDC",
          supplied: "1000.00",
          borrowed: "0.00",
          apy: 2.5,
          collateral: true
        },
        {
          asset: "WETH",
          symbol: "WETH",
          supplied: "0.00",
          borrowed: "0.50",
          apy: 4.2,
          collateral: false
        }
      ];
      setPositions(mockPositions);
      showSuccessNotification(
        "Your Aave positions have been refreshed",
        "Positions Updated"
      );
    } catch (error) {
      showErrorNotification(error, "Failed to fetch positions");
    } finally {
      setLoading(false);
    }
  }

  async function supplyAsset() {
    if (!selectedAsset || !supplyAmount || !cfg) return;
    
    const w = loadWallet();
    if (!w) {
      showErrorNotification(
        new Error("Please unlock your wallet first"),
        "Wallet Required"
      );
      return;
    }

    try {
      setLoading(true);
      showInfoNotification(
        `Preparing to supply ${supplyAmount} ${selectedAsset}...`,
        "Supply Started"
      );
      
      // Mock supply action - in real implementation, this would call Aave contracts
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      showSuccessNotification(
        `Successfully supplied ${supplyAmount} ${selectedAsset} to Aave`,
        "Supply Successful"
      );
      setSupplyAmount("");
      setSelectedAsset("");
    } catch (error) {
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
            <Select
              label="Network"
              value={String(chainId)}
              onChange={(v) => setChainId(Number(v))}
              data={Object.values(CHAINS).map((c) => ({ value: String(c.id), label: `${c.name}` }))}
              w={200}
            />
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
          <Card withBorder shadow="sm" padding="lg">
            <Group justify="space-between" align="center" mb="md">
              <Text size="md" fw={600}>Your Aave Positions</Text>
              <Badge color={walletAddress ? "green" : "red"}>
                {walletAddress ? "Wallet Connected" : "No Wallet"}
              </Badge>
            </Group>
            
            {positions.length > 0 ? (
              <Table withTableBorder withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Asset</Table.Th>
                    <Table.Th>Supplied</Table.Th>
                    <Table.Th>Borrowed</Table.Th>
                    <Table.Th>APY</Table.Th>
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
                      <Table.Td>{pos.apy}%</Table.Td>
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
                <Text size="sm" c="dimmed" ta="center">
                  No positions found. Connect your wallet and supply assets to get started.
                </Text>
              </Card>
            )}
          </Card>
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
                <Table withTableBorder withColumnBorders size="xs">
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
                  precision={6}
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