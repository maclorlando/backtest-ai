"use client";
import { useState, useEffect } from "react";
import { 
  IconWallet, 
  IconChevronDown, 
  IconLogout, 
  IconSettings,
  IconPlus,
  IconRefresh,
  IconCopy,
  IconExternalLink,
  IconX
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
  const [showMenu, setShowMenu] = useState(false);
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
    setShowMenu(false);
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
      <div className="flex items-center gap-3">
        <select
          value={String(currentNetwork)}
          onChange={(e) => handleNetworkChange(e.target.value)}
          className="input text-sm w-24"
        >
          {SUPPORTED_CHAINS.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="btn btn-secondary"
          >
            <IconWallet size={16} />
            Connect Wallet
            <IconChevronDown size={14} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))] rounded-lg shadow-lg z-50">
              <div className="p-2">
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                >
                  <IconPlus size={14} />
                  Create New Wallet
                </button>
                <button
                  onClick={() => {
                    setShowImportModal(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                >
                  <IconSettings size={14} />
                  Import Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <select
          value={String(currentNetwork)}
          onChange={(e) => handleNetworkChange(e.target.value)}
          className="input text-sm w-24"
        >
          {SUPPORTED_CHAINS.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="btn btn-secondary min-w-0"
          >
            <IconWallet size={16} />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 bg-[rgb(var(--accent-primary))] rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {currentWallet.slice(2, 4).toUpperCase()}
              </div>
              <span className="text-sm font-medium truncate max-w-24">
                {currentWallet.slice(0, 6)}...{currentWallet.slice(-4)}
              </span>
              <div className="badge badge-primary flex-shrink-0">
                {isLoadingBalance ? "..." : `${balance} ETH`}
              </div>
            </div>
            <IconChevronDown size={14} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))] rounded-lg shadow-lg z-50">
              <div className="p-4 space-y-4">
                <div className="text-sm font-semibold text-[rgb(var(--fg-primary))]">Wallet</div>
                
                <div>
                  <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-2">Address</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-[rgb(var(--bg-secondary))] px-2 py-1 rounded break-all">
                      {currentWallet}
                    </code>
                    <button onClick={copyAddress} className="icon-btn flex-shrink-0" title="Copy address">
                      <IconCopy size={12} />
                    </button>
                    <button onClick={openExplorer} className="icon-btn flex-shrink-0" title="View on explorer">
                      <IconExternalLink size={12} />
                    </button>
                  </div>
                </div>
                
                <div>
                  <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-2">Balance</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {isLoadingBalance ? "Loading..." : `${balance} ETH`}
                    </span>
                    <button onClick={loadBalance} className="icon-btn flex-shrink-0" title="Refresh balance">
                      <IconRefresh size={12} />
                    </button>
                  </div>
                </div>
                
                <div className="border-t border-[rgb(var(--border-primary))] pt-4">
                  <button
                    onClick={disconnectWallet}
                    className="w-full text-left p-2 rounded hover:bg-red-900/20 text-red-400 flex items-center gap-2"
                  >
                    <IconLogout size={14} />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Create New Wallet</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="icon-btn"
              >
                <IconX size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--fg-secondary))]">
                Create a new wallet with a secure password. Make sure to save your private key safely.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Password</label>
                <input
                  type="password"
                  placeholder="Enter a strong password"
                  value={newWalletPassword}
                  onChange={(e) => setNewWalletPassword(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <button
                onClick={createNewWallet}
                disabled={isCreating}
                className="btn btn-primary w-full"
              >
                {isCreating ? "Creating..." : "Create Wallet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Wallet Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Import Wallet</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="icon-btn"
              >
                <IconX size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--fg-secondary))]">
                Import an existing wallet using your private key.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Private Key</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={importPrivateKey}
                  onChange={(e) => setImportPrivateKey(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Password</label>
                <input
                  type="password"
                  placeholder="Enter password to encrypt"
                  value={importPassword}
                  onChange={(e) => setImportPassword(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <button
                onClick={importWallet}
                disabled={isCreating}
                className="btn btn-primary w-full"
              >
                {isCreating ? "Importing..." : "Import Wallet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
