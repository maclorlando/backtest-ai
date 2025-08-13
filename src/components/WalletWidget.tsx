"use client";
import { useState, useEffect } from "react";
import { 
  Group, 
  Button, 
  Select, 
  Menu, 
  Text, 
  Avatar, 
  Badge, 
  Modal,
  TextInput,
  PasswordInput,
  Stack,
  Divider,
  ActionIcon,
  Tooltip
} from "@mantine/core";
import { 
  IconWallet, 
  IconChevronDown, 
  IconLogout, 
  IconSettings,
  IconPlus,
  IconRefresh,
  IconCopy,
  IconExternalLink
} from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { loadWallet, saveWallet } from "@/lib/wallet/storage";
import { generateWallet, encryptSecret, decryptSecret } from "@/lib/wallet/crypto";
import { buildPublicClientWithFallback } from "@/lib/wallet/viem";
import { formatEther } from "viem";
import { readErc20Balance } from "@/lib/evm/erc20";
import { showErrorNotification, showSuccessNotification } from "@/lib/utils/errorHandling";
import { useApp } from "@/lib/context/AppContext";

// Supported mainnet chains only
const SUPPORTED_CHAINS = [
  { value: "1", label: "Ethereum" },
  { value: "8453", label: "Base" },
  { value: "42161", label: "Arbitrum" },
];

export default function WalletWidget() {
  const { currentWallet, currentNetwork, setCurrentWallet, setCurrentNetwork } = useApp();
  const [balance, setBalance] = useState<string>("0");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newWalletPassword, setNewWalletPassword] = useState("");
  const [importPrivateKey, setImportPrivateKey] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Load wallet on mount
  useEffect(() => {
    const wallet = loadWallet();
    if (wallet?.address && !currentWallet) {
      setCurrentWallet(wallet.address);
    }
  }, [currentWallet, setCurrentWallet]);

  // Load balance when wallet or network changes
  useEffect(() => {
    if (currentWallet) {
      loadBalance();
    }
  }, [currentWallet, currentNetwork]);

  async function loadBalance() {
    if (!currentWallet) return;
    
    setIsLoadingBalance(true);
    try {
      const chain = CHAINS[currentNetwork];
      const rpc = DEFAULT_RPC_BY_CHAIN[currentNetwork];
      const client = buildPublicClientWithFallback(chain, rpc);
      
      const balanceWei = await client.getBalance({ address: currentWallet as `0x${string}` });
      const balanceEth = formatEther(balanceWei);
      setBalance(parseFloat(balanceEth).toFixed(4));
    } catch (error) {
      console.error("Failed to load balance:", error);
      setBalance("0");
    } finally {
      setIsLoadingBalance(false);
    }
  }

  async function createNewWallet() {
    if (!newWalletPassword) {
      showErrorNotification(new Error("Password is required"), "Create Wallet Failed");
      return;
    }

    setIsCreating(true);
    try {
      const { privateKey, address } = await generateWallet();
      const encrypted = await encryptSecret(privateKey, newWalletPassword);
      
      const walletData = {
        address,
        encrypted,
        type: "pk" as const,
        createdAt: Date.now(),
      };
      
      saveWallet(walletData);
      setCurrentWallet(address);
      setShowCreateModal(false);
      setNewWalletPassword("");
      showSuccessNotification("Wallet created successfully", "Wallet Created");
    } catch (error) {
      showErrorNotification(error, "Create Wallet Failed");
    } finally {
      setIsCreating(false);
    }
  }

  async function importWallet() {
    if (!importPrivateKey || !importPassword) {
      showErrorNotification(new Error("Private key and password are required"), "Import Wallet Failed");
      return;
    }

    setIsCreating(true);
    try {
      // Validate private key format
      if (!importPrivateKey.startsWith("0x") || importPrivateKey.length !== 66) {
        throw new Error("Invalid private key format");
      }

      const encrypted = await encryptSecret(importPrivateKey as `0x${string}`, importPassword);
      
      // Derive address from private key
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(importPrivateKey as `0x${string}`);
      const address = account.address;
      
      const walletData = {
        address,
        encrypted,
        type: "pk" as const,
        createdAt: Date.now(),
      };
      
      saveWallet(walletData);
      setCurrentWallet(address);
      setShowImportModal(false);
      setImportPrivateKey("");
      setImportPassword("");
      showSuccessNotification("Wallet imported successfully", "Wallet Imported");
    } catch (error) {
      showErrorNotification(error, "Import Wallet Failed");
    } finally {
      setIsCreating(false);
    }
  }

  function disconnectWallet() {
    setCurrentWallet(null);
    setBalance("0");
    showSuccessNotification("Wallet disconnected", "Wallet Disconnected");
  }

  function copyAddress() {
    if (currentWallet) {
      navigator.clipboard.writeText(currentWallet);
      showSuccessNotification("Address copied to clipboard", "Address Copied");
    }
  }

  function openExplorer() {
    if (currentWallet) {
      const chain = CHAINS[currentNetwork];
      const explorerUrl = chain?.blockExplorers?.default?.url;
      if (explorerUrl) {
        window.open(`${explorerUrl}/address/${currentWallet}`, '_blank');
      }
    }
  }

  function handleNetworkChange(chainId: string | null) {
    if (!chainId) return;
    const newChainId = parseInt(chainId);
    setCurrentNetwork(newChainId);
  }

  if (!currentWallet) {
    return (
      <Group>
        <Select
          label="Network"
          value={String(currentNetwork)}
          onChange={handleNetworkChange}
          data={SUPPORTED_CHAINS}
          w={120}
          size="sm"
        />
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button 
              variant="light" 
              leftSection={<IconWallet size={16} />}
              rightSection={<IconChevronDown size={14} />}
              loading={isConnecting}
            >
              Connect Wallet
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item 
              leftSection={<IconPlus size={14} />}
              onClick={() => setShowCreateModal(true)}
            >
              Create New Wallet
            </Menu.Item>
            <Menu.Item 
              leftSection={<IconSettings size={14} />}
              onClick={() => setShowImportModal(true)}
            >
              Import Wallet
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    );
  }

  return (
    <>
      <Group>
        <Select
          label="Network"
          value={String(currentNetwork)}
          onChange={handleNetworkChange}
          data={SUPPORTED_CHAINS}
          w={120}
          size="sm"
        />
        
        <Menu shadow="md" width={280}>
          <Menu.Target>
            <Button 
              variant="light" 
              leftSection={<IconWallet size={16} />}
              rightSection={<IconChevronDown size={14} />}
            >
              <Group gap="xs">
                <Avatar size="xs" color="blue">
                  {currentWallet.slice(2, 4).toUpperCase()}
                </Avatar>
                <Text size="sm" fw={500}>
                  {currentWallet.slice(0, 6)}...{currentWallet.slice(-4)}
                </Text>
                <Badge size="xs" variant="light">
                  {isLoadingBalance ? "..." : `${balance} ETH`}
                </Badge>
              </Group>
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>Wallet</Menu.Label>
            <Menu.Item>
              <Text size="xs" c="dimmed" mb={4}>Address</Text>
              <Group gap="xs">
                <Text size="sm" style={{ fontFamily: 'monospace' }}>
                  {currentWallet}
                </Text>
                <ActionIcon size="xs" variant="subtle" onClick={copyAddress} component="span">
                  <IconCopy size={12} />
                </ActionIcon>
                <ActionIcon size="xs" variant="subtle" onClick={openExplorer} component="span">
                  <IconExternalLink size={12} />
                </ActionIcon>
              </Group>
            </Menu.Item>
            
            <Menu.Item>
              <Text size="xs" c="dimmed" mb={4}>Balance</Text>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {isLoadingBalance ? "Loading..." : `${balance} ETH`}
                </Text>
                                 <ActionIcon size="xs" variant="subtle" onClick={loadBalance} component="span">
                   <IconRefresh size={12} />
                 </ActionIcon>
              </Group>
            </Menu.Item>

            <Menu.Divider />
            
            <Menu.Item 
              leftSection={<IconLogout size={14} />}
              color="red"
              onClick={disconnectWallet}
            >
              Disconnect
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Create Wallet Modal */}
      <Modal 
        opened={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Wallet"
        size="sm"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Create a new wallet with a secure password. Make sure to save your private key safely.
          </Text>
          <PasswordInput
            label="Password"
            placeholder="Enter a strong password"
            value={newWalletPassword}
            onChange={(e) => setNewWalletPassword(e.target.value)}
            required
          />
          <Button 
            onClick={createNewWallet}
            loading={isCreating}
            fullWidth
          >
            Create Wallet
          </Button>
        </Stack>
      </Modal>

      {/* Import Wallet Modal */}
      <Modal 
        opened={showImportModal} 
        onClose={() => setShowImportModal(false)}
        title="Import Wallet"
        size="sm"
      >
        <Stack>
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
          <Button 
            onClick={importWallet}
            loading={isCreating}
            fullWidth
          >
            Import Wallet
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
