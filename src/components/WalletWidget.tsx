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
  IconX,
  IconPlug,
  IconDatabase
} from "@tabler/icons-react";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { loadWallet, saveWallet, clearWallet } from "@/lib/wallet/storage";
import { generateWallet, encryptSecret, decryptSecret } from "@/lib/wallet/crypto";
import { buildPublicClientWithFallback } from "@/lib/wallet/viem";
import { formatEther } from "viem";
import { readErc20Balance } from "@/lib/evm/erc20";
import { showErrorNotification, showSuccessNotification, showInfoNotification } from "@/lib/utils/errorHandling";
import { useApp } from "@/lib/context/AppContext";

// Supported mainnet chains only
const SUPPORTED_CHAINS = [
  { value: "1", label: "Ethereum" },
  { value: "8453", label: "Base" },
  { value: "42161", label: "Arbitrum" },
];

type WalletType = "external" | "local";

interface WalletInfo {
  address: string;
  type: WalletType;
  name?: string;
  encrypted?: string;
  createdAt?: number;
}

export default function WalletWidget() {
  const { currentWallet, currentNetwork, setCurrentWallet, setCurrentNetwork, removeWallet } = useApp();
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
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [currentWalletType, setCurrentWalletType] = useState<WalletType | null>(null);

  // Load wallets on mount
  useEffect(() => {
    loadAvailableWallets();
  }, []);

  // Load wallet on mount
  useEffect(() => {
    const wallet = loadWallet();
    if (wallet?.address && !currentWallet) {
      setCurrentWallet(wallet.address);
      setCurrentWalletType("local");
    }
  }, [currentWallet, setCurrentWallet]);

  // Refresh available wallets when current wallet changes
  useEffect(() => {
    loadAvailableWallets();
  }, [currentWallet]);

  // Load balance when wallet or network changes
  useEffect(() => {
    if (currentWallet) {
      loadBalance();
    }
  }, [currentWallet, currentNetwork]);

  // Listen for external wallet connection changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (currentWalletType === "external") {
        if (accounts.length === 0) {
          // User disconnected their wallet
          setCurrentWallet(null);
          setCurrentWalletType(null);
          setBalance("0");
          showInfoNotification("External wallet disconnected", "Wallet Disconnected");
        } else if (accounts[0] !== currentWallet) {
          // User switched accounts
          setCurrentWallet(accounts[0]);
          showSuccessNotification("Switched to different account", "Account Switched");
        }
      }
    };

    const handleChainChanged = () => {
      // Reload the page when chain changes to ensure proper state
      window.location.reload();
    };

    const handleDisconnect = () => {
      if (currentWalletType === "external") {
        setCurrentWallet(null);
        setCurrentWalletType(null);
        setBalance("0");
        showInfoNotification("External wallet disconnected", "Wallet Disconnected");
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('disconnect', handleDisconnect);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
      window.ethereum.removeListener('disconnect', handleDisconnect);
    };
  }, [currentWallet, currentWalletType]);

  function loadAvailableWallets() {
    const wallets: WalletInfo[] = [];
    
    // Load local wallet
    const localWallet = loadWallet();
    if (localWallet?.address) {
      wallets.push({
        address: localWallet.address,
        type: "local",
        name: "Local Wallet",
        encrypted: localWallet.encrypted,
        createdAt: localWallet.createdAt
      });
    }
    
    setAvailableWallets(wallets);
  }

  async function connectExternalWallet() {
    if (typeof window === 'undefined' || !window.ethereum) {
      showErrorNotification(new Error("No Ethereum wallet detected. Please install MetaMask or Brave Wallet."), "Connection Failed");
      return;
    }

    setIsConnecting(true);
    try {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        setCurrentWallet(address);
        setCurrentWalletType("external");
        showSuccessNotification("External wallet connected successfully", "Wallet Connected");
      } else {
        throw new Error("No accounts found");
      }
    } catch (error) {
      showErrorNotification(error, "Connection Failed");
    } finally {
      setIsConnecting(false);
    }
  }

  async function switchToLocalWallet(address: string) {
    setCurrentWallet(address);
    setCurrentWalletType("local");
    setShowMenu(false);
    showSuccessNotification("Switched to local wallet", "Wallet Switched");
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
        createdAt: Date.now(),
      };
      
      saveWallet(walletData);
      setCurrentWallet(address);
      setCurrentWalletType("local");
      setShowCreateModal(false);
      setNewWalletPassword("");
      loadAvailableWallets(); // Refresh wallet list
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
        createdAt: Date.now(),
      };
      
      saveWallet(walletData);
      setCurrentWallet(address);
      setCurrentWalletType("local");
      setShowImportModal(false);
      setImportPrivateKey("");
      setImportPassword("");
      loadAvailableWallets(); // Refresh wallet list
      showSuccessNotification("Wallet imported successfully", "Wallet Imported");
    } catch (error) {
      showErrorNotification(error, "Import Wallet Failed");
    } finally {
      setIsCreating(false);
    }
  }

  function disconnectWallet() {
    // Clear the wallet from localStorage if it's a local wallet
    if (currentWalletType === "local") {
      clearWallet();
    }
    
    // For external wallets, we need to disconnect from the provider
    if (currentWalletType === "external" && typeof window !== 'undefined' && window.ethereum) {
      // Note: Most wallets don't support programmatic disconnection
      // We just clear our local state
    }
    
    setCurrentWallet(null);
    setCurrentWalletType(null);
    setBalance("0");
    setShowMenu(false);
    
    // Notify AppContext to remove wallet
    removeWallet();
    
    // Refresh available wallets list
    loadAvailableWallets();
    
    showSuccessNotification("Wallet disconnected", "Wallet Disconnected");
  }

  // Function to handle wallet removal from other parts of the app
  useEffect(() => {
    if (!currentWallet) {
      setCurrentWalletType(null);
      setBalance("0");
      loadAvailableWallets();
    }
  }, [currentWallet]);

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
            <div className="absolute right-0 top-full mt-2 w-64 bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))] rounded-lg shadow-lg z-50">
              <div className="p-2 space-y-1">
                {/* External Wallet Connection */}
                <button
                  onClick={connectExternalWallet}
                  disabled={isConnecting}
                  className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                >
                  <IconPlug size={14} />
                  {isConnecting ? "Connecting..." : "Connect External Wallet"}
                </button>
                
                {/* Available Local Wallets */}
                {availableWallets.length > 0 && (
                  <>
                    <div className="border-t border-[rgb(var(--border-primary))] my-2"></div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))] px-2 py-1">Local Wallets</div>
                    {availableWallets.map((wallet) => (
                      <button
                        key={wallet.address}
                        onClick={() => switchToLocalWallet(wallet.address)}
                        className="w-full text-left p-2 rounded hover:bg-[rgb(var(--bg-secondary))] flex items-center gap-2"
                      >
                        <IconDatabase size={14} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {wallet.name || "Local Wallet"}
                          </div>
                          <div className="text-xs text-[rgb(var(--fg-tertiary))] truncate">
                            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
                
                <div className="border-t border-[rgb(var(--border-primary))] my-2"></div>
                
                {/* Create/Import Options */}
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
              {currentWalletType && (
                <div className="badge badge-secondary flex-shrink-0 text-xs">
                  {currentWalletType === "external" ? "EXT" : "LOCAL"}
                </div>
              )}
            </div>
            <IconChevronDown size={14} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))] rounded-lg shadow-lg z-50">
              <div className="p-4 space-y-4">
                <div className="text-sm font-semibold text-[rgb(var(--fg-primary))]">
                  Wallet {currentWalletType === "external" ? "(External)" : "(Local)"}
                </div>
                
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
