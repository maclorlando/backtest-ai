"use client";
import { useEffect, useState } from "react";
import { Card, Text, Button, TextInput, Group, Select, Table, Badge, Grid, ActionIcon, Tooltip, Divider, Modal, Stack, PasswordInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRefresh, IconPlus, IconTrash, IconCopy, IconEye, IconEyeOff, IconWallet, IconKey, IconDownload, IconUpload } from "@tabler/icons-react";
import { encryptSecret, decryptSecret } from "@/lib/wallet/crypto";
import { loadWallet, saveWallet, clearWallet, loadTrackedTokens, saveTrackedTokens, type TrackedToken } from "@/lib/wallet/storage";
import { createRandomPrivateKey, buildPublicClient, buildPublicClientWithFallback, buildWalletClient } from "@/lib/wallet/viem";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { Address, formatEther } from "viem";
import { readErc20Balance, readErc20Metadata } from "@/lib/evm/erc20";
import { fetchCurrentPricesUSD } from "@/lib/prices";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation } from "@/lib/utils/errorHandling";
import { useApp } from "@/lib/context/AppContext";

export default function WalletPage() {
  const { currentNetwork } = useApp();
  const chainId = currentNetwork;
  const [unlockedPk, setUnlockedPk] = useState<`0x${string}` | null>(null);
  const [address, setAddress] = useState<string>("");
  const [tracked, setTracked] = useState<TrackedToken[]>([]);
  const [balances, setBalances] = useState<{ native: string; tokens: Array<{ token: TrackedToken; value: number; raw: bigint }>; usd: number; perTokenUsd: Record<string, number> }>({ native: "0", tokens: [], usd: 0, perTokenUsd: {} });
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [importPrivateKey, setImportPrivateKey] = useState("");
  const [importPassword, setImportPassword] = useState("");

  const chain = CHAINS[chainId];
  const rpc = DEFAULT_RPC_BY_CHAIN[chainId];

  useEffect(() => {
    setTracked(loadTrackedTokens(chainId));
  }, [chainId]);

  useEffect(() => {
    const stored = loadWallet();
    if (stored?.address) setAddress(stored.address);
  }, []);

  async function createWalletHandler() {
    try {
      setLoading(true);
      if (!createPassword) {
        showErrorNotification(
          new Error("Please enter a password first"),
          "Password Required"
        );
        return;
      }
      
      const { generateWallet } = await import("@/lib/wallet/crypto");
      const wallet = await generateWallet();
      const { encryptSecret } = await import("@/lib/wallet/crypto");
      const encrypted = await encryptSecret(wallet.privateKey, createPassword);
      const walletData = { 
        type: "pk" as const, 
        address: wallet.address, 
        encrypted, 
        createdAt: Date.now() 
      };
      
      saveWallet(walletData);
      setAddress(wallet.address);
      setUnlockedPk(wallet.privateKey);
      setShowPrivateKey(true);
      setShowCreateModal(false);
      setCreatePassword("");
      
      showSuccessNotification(
        "Wallet created successfully! Make sure to save your private key securely.",
        "Wallet Created"
      );
      
      // Automatically refresh balances after creating wallet
      setTimeout(() => refreshBalances(), 500);
    } catch (error) {
      showErrorNotification(error, "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  }

  async function importWallet() {
    try {
      setLoading(true);
      if (!importPrivateKey || !importPassword) {
        showErrorNotification(
          new Error("Please enter both private key and password"),
          "Input Required"
        );
        return;
      }
      
      // Validate private key format
      if (!importPrivateKey.startsWith("0x") || importPrivateKey.length !== 66) {
        throw new Error("Invalid private key format");
      }
      
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(importPrivateKey as `0x${string}`);
      
      const { encryptSecret } = await import("@/lib/wallet/crypto");
      const encrypted = await encryptSecret(importPrivateKey as `0x${string}`, importPassword);
      const walletData = { 
        type: "pk" as const, 
        address: account.address, 
        encrypted, 
        createdAt: Date.now() 
      };
      
      saveWallet(walletData);
      setAddress(account.address);
      setUnlockedPk(importPrivateKey as `0x${string}`);
      setShowPrivateKey(true);
      setShowImportModal(false);
      setImportPrivateKey("");
      setImportPassword("");
      
      showSuccessNotification(
        "Wallet imported successfully!",
        "Wallet Imported"
      );
      
      // Automatically refresh balances after importing wallet
      setTimeout(() => refreshBalances(), 500);
    } catch (error) {
      showErrorNotification(error, "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  }

  async function unlock() {
    try {
      setLoading(true);
      const wallet = loadWallet();
      if (!wallet) {
        showErrorNotification(
          new Error("No wallet found. Please create or import a wallet first."),
          "No Wallet Found"
        );
        return;
      }
      
      if (!unlockPassword) {
        showErrorNotification(
          new Error("Please enter a password first"),
          "Password Required"
        );
        return;
      }
      
      const { decryptSecret } = await import("@/lib/wallet/crypto");
      const pk = (await decryptSecret(wallet.encrypted, unlockPassword)) as `0x${string}`;
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(pk);
      
      setAddress(account.address);
      setUnlockedPk(pk);
      setShowPrivateKey(true);
      setShowUnlockModal(false);
      setUnlockPassword("");
      
      showSuccessNotification(
        "Wallet unlocked successfully!",
        "Wallet Unlocked"
      );
      
      // Automatically refresh balances after unlocking
      setTimeout(() => refreshBalances(), 500);
    } catch (error) {
      showErrorNotification(error, "Failed to unlock wallet");
    } finally {
      setLoading(false);
    }
  }

  function lock() {
    setAddress("");
    setUnlockedPk(null);
    setShowPrivateKey(false);
    showInfoNotification(
      "Wallet has been locked",
      "Wallet Locked"
    );
  }

  function forget() {
    if (confirm("Are you sure you want to forget this wallet? This will remove it from storage.")) {
      localStorage.removeItem("bt_wallet");
      setAddress("");
      setUnlockedPk(null);
      setShowPrivateKey(false);
      showInfoNotification(
        "Wallet has been removed from storage",
        "Wallet Forgotten"
      );
    }
  }

  function copyAddress() {
    if (address) {
      navigator.clipboard.writeText(address);
      showSuccessNotification(
        "Address copied to clipboard",
        "Copied"
      );
    }
  }

  function copyPrivateKey() {
    if (unlockedPk) {
      navigator.clipboard.writeText(unlockedPk);
      showSuccessNotification(
        "Private key copied to clipboard",
        "Copied"
      );
    }
  }

  async function addToken(addr: string) {
    if (!addr || !addr.startsWith("0x")) {
      showErrorNotification(
        new Error("Please enter a valid token address"),
        "Invalid Address"
      );
      return;
    }
    
    try {
      setLoading(true);
      const pub = buildPublicClientWithFallback(chain, rpc);
      const metadata = await retryOperation(async () => {
        return await readErc20Metadata(pub, addr as Address);
      }, 3, 1000);
      
      const newToken = {
        address: addr,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
      };
      
      const next = [...tracked, newToken];
      setTracked(next);
      saveTrackedTokens(chainId, next);
      
      showSuccessNotification(
        `Added ${metadata.symbol} (${metadata.name}) to tracking`,
        "Token Added"
      );
    } catch (error) {
      showErrorNotification(error, "Failed to add token");
    } finally {
      setLoading(false);
    }
  }

  function removeToken(address: string) {
    const next = tracked.filter(t => t.address !== address);
    setTracked(next);
    saveTrackedTokens(chainId, next);
    showInfoNotification(
      "Token has been removed from tracking",
      "Token Removed"
    );
  }

  async function refreshBalances() {
    if (!address) {
      showErrorNotification(
        new Error("Please unlock your wallet first"),
        "No Wallet"
      );
      return;
    }
    
    try {
      setLoading(true);
      showInfoNotification(
        "Fetching your wallet balances...",
        "Refreshing"
      );
      
      const pub = buildPublicClientWithFallback(chain, rpc);
      const addr = address as Address;
      
      // Use retry operation for network calls
      const [nativeBal] = await Promise.all([
        retryOperation(async () => {
          return await pub.getBalance({ address: addr });
        }, 3, 1000).catch(() => 0n),
      ]);
      
      const tokenBalances = await Promise.all(
        tracked.map(async (t) => {
          try {
            const bal = await retryOperation(async () => {
              return await readErc20Balance(pub, t.address as Address, addr, t.decimals);
            }, 3, 1000);
            return { token: t, value: bal.value, raw: bal.raw };
          } catch (error) {
            showErrorNotification(
              error,
              `Failed to fetch ${t.symbol} balance`
            );
            return { token: t, value: 0, raw: 0n };
          }
        })
      );
      
      // USD pricing by symbol (best-effort)
      const ids: string[] = ["ethereum"]; // Always include ETH for native balance
      const symbolToId: Record<string, string> = {
        USDC: "usd-coin",
        WETH: "ethereum",
        ETH: "ethereum",
        WBTC: "bitcoin",
        AAVE: "aave",
        LINK: "chainlink",
      };
      const syms = Array.from(new Set(tokenBalances.map((x) => x.token.symbol.toUpperCase())));
      for (const s of syms) if (symbolToId[s]) ids.push(symbolToId[s]);
      
      const apiKey = typeof window !== "undefined" ? localStorage.getItem("bt_cg_key") || undefined : undefined;
      
      let px: Record<string, number> = {};
      try {
        px = await retryOperation(async () => {
          return await fetchCurrentPricesUSD(ids as unknown as ("usd-coin"|"ethereum"|"bitcoin"|"aave"|"chainlink")[], apiKey);
        }, 3, 1000);
      } catch (error) {
        showErrorNotification(
          error,
          "Failed to fetch price data"
        );
      }
      
      const perTokenUsd: Record<string, number> = {};
      for (const tb of tokenBalances) {
        const id = symbolToId[tb.token.symbol.toUpperCase()];
        if (id && px[id]) perTokenUsd[tb.token.address] = tb.value * px[id];
      }
      
      // Calculate native ETH USD value
      const nativeEthUsd = px["ethereum"] ? parseFloat(formatEther(nativeBal)) * px["ethereum"] : 0;
      const totalUsd = Object.values(perTokenUsd).reduce((a, b) => a + b, 0) + nativeEthUsd;
      
      setBalances({ 
        native: formatEther(nativeBal), 
        tokens: tokenBalances, 
        usd: totalUsd, 
        perTokenUsd: { ...perTokenUsd, native: nativeEthUsd }
      });
      
      showSuccessNotification(
        "Your wallet balances have been refreshed",
        "Balances Updated"
      );
    } catch (error) {
      showErrorNotification(error, "Failed to fetch balances");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="center">
          <div>
            <Text size="lg" fw={700}>Wallet Manager</Text>
            <Text size="sm" c="dimmed">Advanced wallet management and configuration</Text>
          </div>
          <Text size="sm" c="dimmed">
            Network: {CHAINS[chainId]?.name || `Chain ${chainId}`}
          </Text>
        </Group>
      </Card>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="sm" padding="lg">
            <Group justify="space-between" align="center" mb="md">
              <Text size="md" fw={600}>Wallet Actions</Text>
              <IconWallet size={20} />
            </Group>
            
            <Stack gap="md">
              <Button 
                variant="filled"
                onClick={() => setShowCreateModal(true)}
                leftSection={<IconPlus size={16} />}
                fullWidth
              >
                Create New Wallet
              </Button>
              
              <Button 
                variant="light"
                onClick={() => setShowImportModal(true)}
                leftSection={<IconUpload size={16} />}
                fullWidth
              >
                Import Wallet
              </Button>
              
              {address && !unlockedPk && (
                <Button 
                  variant="light"
                  onClick={() => setShowUnlockModal(true)}
                  leftSection={<IconKey size={16} />}
                  fullWidth
                >
                  Unlock Wallet
                </Button>
              )}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder shadow="sm" padding="lg">
            <Group justify="space-between" align="center" mb="md">
              <Text size="md" fw={600}>Wallet Status</Text>
              <Badge color={unlockedPk ? "green" : address ? "orange" : "gray"}>
                {unlockedPk ? "Unlocked" : address ? "Locked" : "No Wallet"}
              </Badge>
            </Group>
            
            {address ? (
              <Stack gap="md">
                <div>
                  <Text size="xs" c="dimmed" mb={4}>Address</Text>
                  <Group gap="xs">
                    <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>
                      {address}
                    </Text>
                    <Tooltip label="Copy address">
                      <ActionIcon variant="light" size="xs" onClick={copyAddress}>
                        <IconCopy size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </div>
                
                {unlockedPk && (
                  <div>
                    <Text size="xs" c="dimmed" mb={4}>Private Key</Text>
                    <Group gap="xs">
                      <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>
                        {showPrivateKey ? unlockedPk : "••••••••••••••••••••••••••••••••"}
                      </Text>
                      <Tooltip label={showPrivateKey ? "Hide private key" : "Show private key"}>
                        <ActionIcon 
                          variant="light" 
                          size="xs" 
                          onClick={() => setShowPrivateKey(!showPrivateKey)}
                        >
                          {showPrivateKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Copy private key">
                        <ActionIcon variant="light" size="xs" onClick={copyPrivateKey}>
                          <IconCopy size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </div>
                )}
                
                <Group mt="md">
                  {unlockedPk && (
                    <>
                      <Button 
                        variant="light" 
                        color="orange" 
                        onClick={lock}
                        size="sm"
                      >
                        Lock
                      </Button>
                      <Button 
                        variant="light" 
                        color="red" 
                        onClick={forget}
                        size="sm"
                      >
                        Forget
                      </Button>
                    </>
                  )}
                </Group>
              </Stack>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                No wallet found. Create a new wallet or import an existing one to get started.
              </Text>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="center" mb="md">
          <Text size="md" fw={600}>Tracked Tokens</Text>
          <Badge color={tracked.length > 0 ? "green" : "gray"}>
            {tracked.length} tokens
          </Badge>
        </Group>
        <AddTokenForm onAdd={addToken} loading={loading} />
        {tracked.length > 0 && (
          <Table mt="md" withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Symbol</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Address</Table.Th>
                <Table.Th>Decimals</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tracked.map((t) => (
                <Table.Tr key={t.address}>
                  <Table.Td>
                    <Text fw={600}>{t.symbol}</Text>
                  </Table.Td>
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td>
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                      {t.address.slice(0, 8)}...{t.address.slice(-6)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{t.decimals}</Table.Td>
                  <Table.Td>
                    <Tooltip label="Remove token">
                      <ActionIcon 
                        variant="light" 
                        color="red" 
                        size="xs"
                        onClick={() => removeToken(t.address)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder shadow="sm" padding="lg">
        <Group justify="space-between" align="center" mb="md">
          <Text size="md" fw={600}>Wallet Balances</Text>
          <Button 
            onClick={refreshBalances} 
            disabled={!address || loading}
            loading={loading}
            leftSection={<IconRefresh size={16} />}
            size="sm"
          >
            Refresh
          </Button>
        </Group>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div>
              <Text size="sm" fw={600}>Native Balance</Text>
              <Text size="xs" c="dimmed">{chain?.nativeCurrency?.symbol || "ETH"}</Text>
            </div>
            <div className="text-right">
              <Text size="lg" fw={700}>{balances.native}</Text>
              {balances.perTokenUsd.native > 0 && (
                <Text size="xs" c="dimmed">${balances.perTokenUsd.native.toFixed(2)}</Text>
              )}
            </div>
          </div>
          
          {balances.tokens.length > 0 && (
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Symbol</Table.Th>
                  <Table.Th>Balance</Table.Th>
                  <Table.Th>USD Value</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {balances.tokens.map((row) => (
                  <Table.Tr key={row.token.address}>
                    <Table.Td>
                      <Text fw={600}>{row.token.symbol}</Text>
                    </Table.Td>
                    <Table.Td>{row.value.toFixed(6)}</Table.Td>
                    <Table.Td>
                      {balances.perTokenUsd[row.token.address]?.toFixed(2) || "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          
          {balances.usd > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Text size="sm" fw={600}>Total USD Value</Text>
              <Text size="lg" fw={700} c="blue">${balances.usd.toFixed(2)}</Text>
            </div>
          )}
        </div>
      </Card>

      {/* Create Wallet Modal */}
      <Modal 
        opened={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Wallet"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Create a new wallet with a secure password. Make sure to save your private key safely.
          </Text>
          <PasswordInput
            label="Password"
            placeholder="Enter a strong password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            required
          />
          <Group justify="flex-end" gap="sm">
            <Button 
              variant="light" 
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={createWalletHandler}
              loading={loading}
              disabled={!createPassword}
            >
              Create Wallet
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Unlock Wallet Modal */}
      <Modal 
        opened={showUnlockModal} 
        onClose={() => setShowUnlockModal(false)}
        title="Unlock Wallet"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Enter your wallet password to unlock it.
          </Text>
          <PasswordInput
            label="Password"
            placeholder="Enter your wallet password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            required
          />
          <Group justify="flex-end" gap="sm">
            <Button 
              variant="light" 
              onClick={() => setShowUnlockModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={unlock}
              loading={loading}
              disabled={!unlockPassword}
            >
              Unlock
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Wallet Modal */}
      <Modal 
        opened={showImportModal} 
        onClose={() => setShowImportModal(false)}
        title="Import Wallet"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Import an existing wallet using your private key.
          </Text>
          <TextInput
            label="Private Key"
            placeholder="0x..."
            value={importPrivateKey}
            onChange={(e) => setImportPrivateKey(e.target.value)}
            required
          />
          <PasswordInput
            label="Password"
            placeholder="Enter password to encrypt"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            required
          />
          <Group justify="flex-end" gap="sm">
            <Button 
              variant="light" 
              onClick={() => setShowImportModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={importWallet}
              loading={loading}
              disabled={!importPrivateKey || !importPassword}
            >
              Import Wallet
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}

function RecoverForm({ onRecover, disabled }: { onRecover: (pk: string) => void; disabled?: boolean }) {
  const [pk, setPk] = useState("");
  return (
    <Group>
      <TextInput 
        placeholder="0x..private key" 
        value={pk} 
        onChange={(e) => setPk(e.currentTarget.value)} 
        style={{ width: 280 }}
        disabled={disabled}
      />
      <Button 
        onClick={() => onRecover(pk)} 
        disabled={disabled || !pk.startsWith("0x")}
        variant="light"
      >
        Recover
      </Button>
    </Group>
  );
}

function AddTokenForm({ onAdd, loading }: { onAdd: (addr: string) => void; loading?: boolean }) {
  const [addr, setAddr] = useState("");
  return (
    <Group>
      <TextInput 
        placeholder="Token address (0x...)" 
        value={addr} 
        onChange={(e) => setAddr(e.currentTarget.value)} 
        style={{ width: 420 }}
        disabled={loading}
      />
      <Button 
        onClick={() => {
          onAdd(addr);
          setAddr("");
        }} 
        disabled={!addr.startsWith("0x") || loading}
        loading={loading}
        leftSection={<IconPlus size={16} />}
      >
        Add Token
      </Button>
    </Group>
  );
}