"use client";
import { useEffect, useState } from "react";
import { IconRefresh, IconPlus, IconTrash, IconCopy, IconEye, IconEyeOff, IconWallet, IconKey, IconDownload, IconUpload, IconX, IconSearch } from "@tabler/icons-react";
import { encryptSecret, decryptSecret } from "@/lib/wallet/crypto";
import { loadWallet, saveWallet, clearWallet, loadTrackedTokens, saveTrackedTokens, type TrackedToken, searchTokens, getPopularTokens, addTrackedToken, removeTrackedToken, isTokenTracked } from "@/lib/wallet/storage";
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
  const [unlockedPk, setUnlockedPk] = useState<string | null>(null);
  const [address, setAddress] = useState<string>("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tracked, setTracked] = useState<TrackedToken[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddTokenModal, setShowAddTokenModal] = useState(false);
  const [showSearchTokenModal, setShowSearchTokenModal] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [importPrivateKey, setImportPrivateKey] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [addTokenAddress, setAddTokenAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string; address: string; decimals: number }>>([]);

  useEffect(() => {
    const wallet = loadWallet();
    if (wallet?.address) {
      setAddress(wallet.address);
    }
    setTracked(loadTrackedTokens(chainId));
  }, [chainId]);

  useEffect(() => {
    if (address && tracked.length > 0) {
      refreshBalances();
    }
  }, [address, tracked, chainId]);

  async function refreshBalances() {
    if (!address || tracked.length === 0) return;
    
    try {
      setLoading(true);
      const chain = CHAINS[chainId];
      const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
      
      if (!chain || !rpc) {
        showErrorNotification(new Error("Invalid network configuration"), "Network Error");
        return;
      }

      const pub = buildPublicClientWithFallback(chain, rpc);
      const newBalances: Record<string, string> = {};
      const tokenAddresses: string[] = [];

      // Get native balance
      const nativeBalance = await retryOperation(async () => {
        return await pub.getBalance({ address: address as Address });
      }, 3, 1000);
      
      newBalances["native"] = formatEther(nativeBalance);
      tokenAddresses.push("native");

      // Get token balances
      for (const token of tracked) {
        try {
          const balance = await retryOperation(async () => {
            return await readErc20Balance(pub, token.address as Address, address as Address);
          }, 3, 1000);
          
          newBalances[token.address] = balance;
          tokenAddresses.push(token.address);
        } catch (error) {
          console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
          newBalances[token.address] = "0";
        }
      }

      setBalances(newBalances);

      // Fetch prices
      try {
        const tokenPrices = await fetchCurrentPricesUSD(tokenAddresses);
        setPrices(tokenPrices);
      } catch (error) {
        console.warn("Failed to fetch prices:", error);
      }

    } catch (error) {
      showErrorNotification(error, "Failed to refresh balances");
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
      const chain = CHAINS[chainId];
      const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
      
      if (!chain || !rpc) {
        showErrorNotification(new Error("Invalid network configuration"), "Network Error");
        return;
      }

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
      
      const wasAdded = addTrackedToken(chainId, newToken);
      if (wasAdded) {
        setTracked(loadTrackedTokens(chainId));
        showSuccessNotification(
          `Added ${metadata.symbol} (${metadata.name}) to tracking`,
          "Token Added"
        );
      } else {
        showInfoNotification(
          `${metadata.symbol} is already being tracked`,
          "Already Tracked"
        );
      }
    } catch (error) {
      showErrorNotification(error, "Failed to add token");
    } finally {
      setLoading(false);
    }
  }

  function removeToken(addr: string) {
    removeTrackedToken(chainId, addr);
    setTracked(loadTrackedTokens(chainId));
    showSuccessNotification(
      "Token removed from tracking",
      "Token Removed"
    );
  }

  function searchPopularTokens(query: string) {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    
    const results = searchTokens(chainId, query);
    setSearchResults(results);
  }

  function addPopularToken(token: { symbol: string; name: string; address: string; decimals: number }) {
    const newToken: TrackedToken = {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
    };
    
    const wasAdded = addTrackedToken(chainId, newToken);
    if (wasAdded) {
      setTracked(loadTrackedTokens(chainId));
      showSuccessNotification(
        `Added ${token.symbol} (${token.name}) to tracking`,
        "Token Added"
      );
      setShowSearchTokenModal(false);
      setSearchQuery("");
      setSearchResults([]);
    } else {
      showInfoNotification(
        `${token.symbol} is already being tracked`,
        "Already Tracked"
      );
    }
  }

  function showPopularTokens() {
    const popularTokens = getPopularTokens(chainId);
    setSearchResults(popularTokens);
    setSearchQuery("");
  }

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">Wallet Manager</h1>
            <p className="text-[rgb(var(--fg-secondary))]">Advanced wallet management and configuration</p>
          </div>
          <div className="text-sm text-[rgb(var(--fg-secondary))]">
            Network: {CHAINS[chainId]?.name || `Chain ${chainId}`}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="widget-grid">
        {/* Wallet Actions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Wallet Actions</h3>
            <IconWallet size={20} />
          </div>
          
          <div className="space-y-3">
            <button 
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary w-full"
            >
              <IconPlus size={16} />
              Create New Wallet
            </button>
            
            <button 
              onClick={() => setShowImportModal(true)}
              className="btn btn-secondary w-full"
            >
              <IconUpload size={16} />
              Import Wallet
            </button>
            
            {address && !unlockedPk && (
              <button 
                onClick={() => setShowUnlockModal(true)}
                className="btn btn-secondary w-full"
              >
                <IconKey size={16} />
                Unlock Wallet
              </button>
            )}
          </div>
        </div>

        {/* Wallet Status */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Wallet Status</h3>
            <div className={`badge ${unlockedPk ? 'badge-success' : address ? 'badge-primary' : ''}`}>
              {unlockedPk ? "Unlocked" : address ? "Locked" : "No Wallet"}
            </div>
          </div>
          
          {address ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-2">Address</div>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-[rgb(var(--bg-tertiary))] px-2 py-1 rounded">
                    {address}
                  </code>
                  <button onClick={copyAddress} className="icon-btn" title="Copy address">
                    <IconCopy size={14} />
                  </button>
                </div>
              </div>
              
              {unlockedPk && (
                <div>
                  <div className="text-xs text-[rgb(var(--fg-tertiary))] mb-2">Private Key</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-[rgb(var(--bg-tertiary))] px-2 py-1 rounded">
                      {showPrivateKey ? unlockedPk : "••••••••••••••••••••••••••••••••"}
                    </code>
                    <button 
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="icon-btn"
                      title={showPrivateKey ? "Hide private key" : "Show private key"}
                    >
                      {showPrivateKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </button>
                    <button onClick={copyPrivateKey} className="icon-btn" title="Copy private key">
                      <IconCopy size={14} />
                    </button>
                  </div>
                </div>
              )}
              
              {unlockedPk && (
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={lock}
                    className="btn btn-secondary"
                  >
                    Lock
                  </button>
                  <button 
                    onClick={forget}
                    className="btn btn-secondary text-red-400 hover:text-red-300"
                  >
                    Forget
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-[rgb(var(--fg-secondary))]">
              No wallet found. Create a new wallet or import an existing one to get started.
            </div>
          )}
        </div>
      </div>

      {/* Tracked Tokens */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Tracked Tokens</h3>
          <div className={`badge ${tracked.length > 0 ? 'badge-success' : ''}`}>
            {tracked.length} tokens
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex gap-2">
            <button 
              onClick={() => setShowAddTokenModal(true)}
              className="btn btn-primary flex-1"
            >
              <IconPlus size={16} />
              Add by Address
            </button>
            <button 
              onClick={() => setShowSearchTokenModal(true)}
              className="btn btn-secondary flex-1"
            >
              <IconSearch size={16} />
              Search Tokens
            </button>
          </div>
          
          <button 
            onClick={showPopularTokens}
            className="btn btn-secondary w-full"
          >
            View Popular Tokens
          </button>
        </div>
        
        {tracked.length > 0 && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[rgb(var(--border-primary))]">
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Address</th>
                  <th className="text-left py-2 px-2">Decimals</th>
                  <th className="text-left py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((t) => (
                  <tr key={t.address} className="border-b border-[rgb(var(--border-primary))]">
                    <td className="py-2 px-2">
                      <span className="font-semibold">{t.symbol}</span>
                    </td>
                    <td className="py-2 px-2">{t.name}</td>
                    <td className="py-2 px-2">
                      <code className="text-xs font-mono">
                        {t.address.slice(0, 8)}...{t.address.slice(-6)}
                      </code>
                    </td>
                    <td className="py-2 px-2">{t.decimals}</td>
                    <td className="py-2 px-2">
                      <button 
                        onClick={() => removeToken(t.address)}
                        className="icon-btn"
                        title="Remove token"
                      >
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wallet Balances */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Wallet Balances</h3>
          <button 
            onClick={refreshBalances} 
            disabled={!address || loading}
            className="btn btn-secondary"
          >
            <IconRefresh size={16} />
            Refresh
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Native Balance</div>
                <div className="text-sm text-[rgb(var(--fg-secondary))]">{CHAINS[chainId]?.nativeCurrency?.symbol || "ETH"}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">{balances.native || "0"}</div>
                {prices.native > 0 && balances.native && (
                  <div className="text-sm text-[rgb(var(--fg-secondary))]">${(parseFloat(balances.native) * prices.native).toFixed(2)}</div>
                )}
              </div>
            </div>
          </div>
          
          {Object.keys(balances).length > 1 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgb(var(--border-primary))]">
                    <th className="text-left py-2 px-2">Symbol</th>
                    <th className="text-left py-2 px-2">Balance</th>
                    <th className="text-left py-2 px-2">USD Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(balances).map(([key, value]) => {
                    if (key === "native") return null;
                    const token = tracked.find(t => t.address === key);
                    if (!token) return null;
                    return (
                      <tr key={key} className="border-b border-[rgb(var(--border-primary))]">
                        <td className="py-2 px-2">
                          <span className="font-semibold">{token.symbol}</span>
                        </td>
                        <td className="py-2 px-2">{value}</td>
                        <td className="py-2 px-2">
                          {prices[key] ? `$${(parseFloat(value) * prices[key]).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {Object.values(prices).reduce((sum, p) => sum + p, 0) > 0 && (
            <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total USD Value</span>
                <span className="text-lg font-bold text-blue-400">
                  ${Object.entries(balances).reduce((sum, [key, value]) => {
                    const price = prices[key] || 0;
                    return sum + (parseFloat(value || "0") * price);
                  }, 0).toFixed(2)}
                </span>
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
              <button onClick={() => setShowCreateModal(false)} className="icon-btn">
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
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={createWalletHandler}
                  disabled={!createPassword || loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? "Creating..." : "Create Wallet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Wallet Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Unlock Wallet</h3>
              <button onClick={() => setShowUnlockModal(false)} className="icon-btn">
                <IconX size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--fg-secondary))]">
                Enter your wallet password to unlock it.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Password</label>
                <input
                  type="password"
                  placeholder="Enter your wallet password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => setShowUnlockModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={unlock}
                  disabled={!unlockPassword || loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? "Unlocking..." : "Unlock"}
                </button>
              </div>
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
              <button onClick={() => setShowImportModal(false)} className="icon-btn">
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
              
              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={importWallet}
                  disabled={!importPrivateKey || !importPassword || loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? "Importing..." : "Import Wallet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Token Modal */}
      {showAddTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Add Token</h3>
              <button onClick={() => setShowAddTokenModal(false)} className="icon-btn">
                <IconX size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--fg-secondary))]">
                Add a token by its address or search for popular tokens.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Token Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={addTokenAddress}
                  onChange={(e) => setAddTokenAddress(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button 
                  onClick={() => setShowAddTokenModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => addToken(addTokenAddress)}
                  disabled={!addTokenAddress || loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? "Adding..." : "Add Token"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Token Modal */}
      {showSearchTokenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Search Tokens</h3>
              <button onClick={() => setShowSearchTokenModal(false)} className="icon-btn">
                <IconX size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search for tokens..."
                  value={searchQuery}
                  onChange={(e) => searchPopularTokens(e.target.value)}
                  className="input flex-1"
                />
                <button onClick={() => showPopularTokens()} className="btn btn-secondary">
                  <IconSearch size={16} />
                </button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="overflow-y-auto max-h-60">
                  {searchResults.map((token) => (
                    <div
                      key={token.address}
                      className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => addPopularToken(token)}
                    >
                      <span>{token.symbol} ({token.name})</span>
                      <span className="text-xs text-[rgb(var(--fg-secondary))]">
                        {token.address.slice(0, 8)}...{token.address.slice(-6)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTokenForm({ onAdd, loading }: { onAdd: (addr: string) => void; loading?: boolean }) {
  const [addr, setAddr] = useState("");
  return (
    <div className="flex gap-3">
      <input 
        placeholder="Token address (0x...)" 
        value={addr} 
        onChange={(e) => setAddr(e.target.value)} 
        className="input flex-1"
        disabled={loading}
      />
      <button 
        onClick={() => {
          onAdd(addr);
          setAddr("");
        }} 
        disabled={!addr.startsWith("0x") || loading}
        className="btn btn-primary"
      >
        <IconPlus size={16} />
        Add Token
      </button>
    </div>
  );
}