"use client";
import { useEffect, useState } from "react";
import { 
  IconWallet, 
  IconPlus, 
  IconUpload, 
  IconKey, 
  IconDownload,
  IconCopy, 
  IconEye, 
  IconEyeOff, 
  IconX, 
  IconSearch, 
  IconTrash,
  IconRefresh
} from "@tabler/icons-react";
import { encryptSecret, decryptSecret, validateAndNormalizePrivateKey } from "@/lib/wallet/crypto";
import { loadWallet, saveWallet, clearWallet, loadTrackedTokens, saveTrackedTokens, type TrackedToken, searchTokens, getPopularTokens, addTrackedToken, removeTrackedToken, isTokenTracked, cleanupDuplicateTokens } from "@/lib/wallet/storage";
import { buildPublicClient, buildPublicClientWithFallback } from "@/lib/wallet/viem";
import { CHAINS, DEFAULT_RPC_BY_CHAIN } from "@/lib/evm/networks";
import { Address, formatEther } from "viem";
import { readErc20Balance, readErc20Metadata } from "@/lib/evm/erc20";
import { fetchCurrentPricesUSD, fetchCoinData, fetchMarketData, fetchTrendingCoins, searchCoins, fetchGlobalData, type CoinGeckoMarketData, type CoinGeckoGlobalData } from "@/lib/prices";
import { type AssetId } from "@/lib/types";
import { showErrorNotification, showSuccessNotification, showInfoNotification, retryOperation, showWarningNotification } from "@/lib/utils/errorHandling";
import { getCoinGeckoApiKey } from "@/lib/utils/apiKey";
import { useApp } from "@/lib/context/AppContext";

export default function WalletPage() {
  const { removeWallet } = useApp();
  const chainId = 8453; // Base mainnet chain ID
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
  
  // Enhanced market data states
  const [marketData, setMarketData] = useState<CoinGeckoMarketData[]>([]);
  const [globalData, setGlobalData] = useState<CoinGeckoGlobalData | null>(null);
  const [trendingCoins, setTrendingCoins] = useState<Array<{ id: string; name: string; symbol: string; thumb: string; score: number }>>([]);
  const [enhancedSearchResults, setEnhancedSearchResults] = useState<Array<{ id: string; name: string; symbol: string; market_cap_rank: number; thumb: string; large: string }>>([]);

  useEffect(() => {
    const wallet = loadWallet();
    if (wallet?.address) {
      setAddress(wallet.address);
    }
    // Clean up any duplicate tokens and load the cleaned list
    cleanupDuplicateTokens(chainId);
    const loadedTokens = loadTrackedTokens(chainId);
    
    // Validate tokens for the current network
    validateTrackedTokensForNetwork(chainId, loadedTokens);
    
    setTracked(loadedTokens);
  }, [chainId]);

  // Function to validate tracked tokens for the current network
  async function validateTrackedTokensForNetwork(chainId: number, tokens: TrackedToken[]) {
    if (tokens.length === 0) return;
    
    const chain = CHAINS[chainId];
    const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
    
    if (!chain || !rpc) {
      showErrorNotification(
        new Error(`Network configuration not found for chain ID ${chainId}`), 
        "Network Configuration Error"
      );
      return;
    }

    const pub = buildPublicClientWithFallback(chain, rpc);
    const invalidTokens: string[] = [];
    
    // Check each token to see if it's valid on the current network
    for (const token of tokens) {
      try {
        // Try to read metadata to validate the token exists on this network
        await retryOperation(async () => {
          return await readErc20Metadata(pub, token.address as Address);
        }, 2, 500); // Shorter timeout for validation
      } catch (error) {
        console.warn(`Token ${token.symbol} (${token.address}) is not valid on chain ${chainId}:`, error);
        invalidTokens.push(token.address);
      }
    }
    
    // If we found invalid tokens, show a warning and offer to clean them up
    if (invalidTokens.length > 0) {
      const networkName = CHAINS[chainId]?.name || `Chain ${chainId}`;
      showWarningNotification(
        `Found ${invalidTokens.length} token(s) that are not valid on ${networkName}. These tokens may have been added on a different network. Use "Clean Invalid" to remove them.`,
        "Invalid Tokens Detected"
      );
    }
  }

  useEffect(() => {
    if (address && tracked.length > 0) {
      refreshBalances();
    }
  }, [address, tracked, chainId]);

  // Refresh balances when network changes
  useEffect(() => {
    if (address && tracked.length > 0) {
      refreshBalances();
    }
  }, [chainId]);

  // Fetch enhanced market data on mount
  useEffect(() => {
    fetchTrendingData();
    fetchGlobalMarketData();
  }, []);

  // Fetch enhanced market data when tracked tokens change
  useEffect(() => {
    if (tracked.length > 0) {
      fetchEnhancedMarketData();
    }
  }, [tracked]);

  async function refreshBalances() {
    if (!address || tracked.length === 0) return;
    
    try {
      setLoading(true);
      const chain = CHAINS[chainId];
      const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
      
      if (!chain || !rpc) {
        showErrorNotification(
          new Error(`Network configuration not found for chain ID ${chainId}`), 
          "Network Configuration Error"
        );
        return;
      }

      const pub = buildPublicClientWithFallback(chain, rpc);
      const newBalances: Record<string, string> = {};
      const validTokenAddresses: string[] = [];

      // Get native balance
      try {
        const nativeBalance = await retryOperation(async () => {
          return await pub.getBalance({ address: address as Address });
        }, 3, 1000);
        
        newBalances["native"] = formatEther(nativeBalance);
        validTokenAddresses.push("native");
      } catch (error) {
        console.warn("Failed to fetch native balance:", error);
        newBalances["native"] = "0";
      }

      // Get token balances
      for (const token of tracked) {
        try {
          const balance = await retryOperation(async () => {
            return await readErc20Balance(pub, token.address as Address, address as Address);
          }, 3, 1000);
          
          newBalances[token.address] = balance;
          // Only add valid token addresses for price fetching
          if (token.symbol && token.symbol !== "UNKNOWN") {
            validTokenAddresses.push(token.symbol.toLowerCase());
          }
        } catch (error) {
          console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
          newBalances[token.address] = "0";
          
          // Provide more specific error messages based on the error type
          if (error instanceof Error) {
            if (error.message.includes("returned no data") || error.message.includes("Invalid ERC20")) {
              showWarningNotification(
                `Token ${token.symbol} (${token.address}) is not valid on the current network. This token may have been added on a different network. Use "Clean Invalid" to remove it.`,
                "Invalid Token on Current Network"
              );
            } else if (error.message.includes("timeout") || error.message.includes("network")) {
              showWarningNotification(
                `Failed to fetch balance for ${token.symbol} due to network issues. Please try again.`,
                "Network Error"
              );
            } else {
              showWarningNotification(
                `Failed to fetch balance for ${token.symbol}: ${error.message}`,
                "Balance Fetch Error"
              );
            }
          }
        }
      }

      setBalances(newBalances);

      // Fetch prices only for valid tokens using symbols
      // Note: CoinGecko API provides global prices regardless of network
      if (tracked.length > 0) {
        try {
          // Create a mapping from common token symbols to CoinGecko IDs
          const symbolToCoinGeckoId: Record<string, string> = {
            'eth': 'ethereum',
            'weth': 'ethereum',
            'btc': 'bitcoin',
            'wbtc': 'bitcoin',
            'usdc': 'usd-coin',
            'usdt': 'tether',
            'dai': 'dai',
            'aave': 'aave',
            'link': 'chainlink',
            'uni': 'uniswap',
            'matic': 'matic-network',
            'bnb': 'binancecoin',
            'ada': 'cardano',
            'dot': 'polkadot',
            'sol': 'solana',
            'avax': 'avalanche-2',
            'atom': 'cosmos',
            'ltc': 'litecoin',
            'bch': 'bitcoin-cash',
            'xrp': 'ripple',
            'doge': 'dogecoin',
            'shib': 'shiba-inu',
            'pepe': 'pepe',
            'arb': 'arbitrum',
            'op': 'optimism',
            'base': 'base',
            'polygon': 'matic-network',
            'chainlink': 'chainlink',
            'uniswap': 'uniswap',
          };

          // Get token symbols and map them to CoinGecko IDs
          const tokenSymbols = tracked
            .filter(token => token.symbol && token.symbol !== "UNKNOWN")
            .map(token => {
              const symbol = token.symbol.toLowerCase();
              return symbolToCoinGeckoId[symbol] || symbol;
            });
          
          if (tokenSymbols.length > 0) {
            const apiKey = getCoinGeckoApiKey();
            const tokenPrices = await fetchCurrentPricesUSD(tokenSymbols as AssetId[], apiKey);
            
            // Map the prices back to the original symbols
            const mappedPrices: Record<string, number> = {};
            tracked.forEach(token => {
              if (token.symbol && token.symbol !== "UNKNOWN") {
                const symbol = token.symbol.toLowerCase();
                const coinGeckoId = symbolToCoinGeckoId[symbol] || symbol;
                if (tokenPrices[coinGeckoId]) {
                  mappedPrices[token.address] = tokenPrices[coinGeckoId];
                  mappedPrices[symbol] = tokenPrices[coinGeckoId];
                }
              }
            });
            
            setPrices(mappedPrices);
          }
        } catch (error) {
          console.warn("Failed to fetch prices:", error);
          showWarningNotification(
            "Failed to fetch current prices. Using fallback prices.",
            "Price Fetch Warning"
          );
        }
      }

    } catch (error) {
      showErrorNotification(error, "Failed to refresh balances");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    if (tracked.length === 0) {
      showInfoNotification(
        "No tracked tokens to refresh prices for",
        "No Tokens"
      );
      return;
    }

    try {
      setLoading(true);
      
      // Create a mapping from common token symbols to CoinGecko IDs
      const symbolToCoinGeckoId: Record<string, string> = {
        'eth': 'ethereum',
        'weth': 'ethereum',
        'btc': 'bitcoin',
        'wbtc': 'bitcoin',
        'usdc': 'usd-coin',
        'usdt': 'tether',
        'dai': 'dai',
        'aave': 'aave',
        'link': 'chainlink',
        'uni': 'uniswap',
        'matic': 'matic-network',
        'bnb': 'binancecoin',
        'ada': 'cardano',
        'dot': 'polkadot',
        'sol': 'solana',
        'avax': 'avalanche-2',
        'atom': 'cosmos',
        'ltc': 'litecoin',
        'bch': 'bitcoin-cash',
        'xrp': 'ripple',
        'doge': 'dogecoin',
        'shib': 'shiba-inu',
        'pepe': 'pepe',
        'arb': 'arbitrum',
        'op': 'optimism',
        'base': 'base',
        'polygon': 'matic-network',
        'chainlink': 'chainlink',
        'uniswap': 'uniswap',
      };
      
      // Get token symbols and map them to CoinGecko IDs
      const tokenSymbols = tracked
        .filter(token => token.symbol && token.symbol !== "UNKNOWN")
        .map(token => {
          const symbol = token.symbol.toLowerCase();
          return symbolToCoinGeckoId[symbol] || symbol;
        });
      
      if (tokenSymbols.length > 0) {
        const apiKey = getCoinGeckoApiKey();
        const tokenPrices = await fetchCurrentPricesUSD(tokenSymbols as AssetId[], apiKey);
        
        // Map the prices back to the original symbols
        const mappedPrices: Record<string, number> = {};
        tracked.forEach(token => {
          if (token.symbol && token.symbol !== "UNKNOWN") {
            const symbol = token.symbol.toLowerCase();
            const coinGeckoId = symbolToCoinGeckoId[symbol] || symbol;
            if (tokenPrices[coinGeckoId]) {
              mappedPrices[token.address] = tokenPrices[coinGeckoId];
              mappedPrices[symbol] = tokenPrices[coinGeckoId];
            }
          }
        });
        
        setPrices(mappedPrices);
        showSuccessNotification(
          `Refreshed prices for ${tokenSymbols.length} tokens`,
          "Prices Updated"
        );
      }
    } catch (error) {
      showErrorNotification(error, "Failed to refresh prices");
    } finally {
      setLoading(false);
    }
  }

  // NEW: Enhanced market data functions

  async function fetchTrendingData() {
    try {
      const trending = await fetchTrendingCoins();
      if (trending) {
        const coins = trending.coins.map((coin: any) => ({
          id: coin.item.id,
          name: coin.item.name,
          symbol: coin.item.symbol,
          thumb: coin.item.thumb,
          score: coin.item.score
        }));
        setTrendingCoins(coins);
      }
    } catch (error) {
      console.warn("Failed to fetch trending coins:", error);
    }
  }

  async function fetchGlobalMarketData() {
    try {
      const global = await fetchGlobalData();
      setGlobalData(global);
    } catch (error) {
      console.warn("Failed to fetch global market data:", error);
    }
  }

  async function fetchEnhancedMarketData() {
    try {
      // Get CoinGecko IDs for tracked tokens
      const symbolToCoinGeckoId: Record<string, string> = {
        'eth': 'ethereum',
        'weth': 'ethereum',
        'btc': 'bitcoin',
        'wbtc': 'bitcoin',
        'usdc': 'usd-coin',
        'usdt': 'tether',
        'dai': 'dai',
        'aave': 'aave',
        'link': 'chainlink',
        'uni': 'uniswap',
        'matic': 'matic-network',
        'bnb': 'binancecoin',
        'ada': 'cardano',
        'dot': 'polkadot',
        'sol': 'solana',
        'avax': 'avalanche-2',
        'atom': 'cosmos',
        'ltc': 'litecoin',
        'bch': 'bitcoin-cash',
        'xrp': 'ripple',
        'doge': 'dogecoin',
        'shib': 'shiba-inu',
        'pepe': 'pepe',
        'arb': 'arbitrum',
        'op': 'optimism',
        'base': 'base',
        'polygon': 'matic-network',
        'chainlink': 'chainlink',
        'uniswap': 'uniswap',
      };

      const coinIds = tracked
        .filter(token => token.symbol && token.symbol !== "UNKNOWN")
        .map(token => {
          const symbol = token.symbol.toLowerCase();
          return symbolToCoinGeckoId[symbol] || symbol;
        })
        .filter(Boolean);

      if (coinIds.length > 0) {
        const apiKey = getCoinGeckoApiKey();
        const marketData = await fetchMarketData(coinIds, apiKey);
        setMarketData(marketData);
      }
    } catch (error) {
      console.warn("Failed to fetch enhanced market data:", error);
    }
  }

  async function enhancedSearchTokens(query: string) {
    if (query.trim().length < 2) {
      setEnhancedSearchResults([]);
      return;
    }

    try {
      const results = await searchCoins(query);
      setEnhancedSearchResults(results);
    } catch (error) {
      console.warn("Failed to search tokens:", error);
      setEnhancedSearchResults([]);
    }
  }

  function addCoinGeckoToken(coin: { id: string; name: string; symbol: string; thumb: string }) {
    // For now, we'll show a notification that this feature is coming
    // In the future, we can integrate this with contract address lookup
    showInfoNotification(
      `Enhanced token addition for ${coin.symbol} (${coin.name}) is coming soon!`,
      "Feature Coming Soon"
    );
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
      clearWallet();
      setAddress("");
      setUnlockedPk(null);
      setShowPrivateKey(false);
      showInfoNotification(
        "Wallet has been removed from storage",
        "Wallet Forgotten"
      );
      removeWallet();
    }
  }

  async function copyAddress() {
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        showSuccessNotification(
          "Address copied to clipboard",
          "Copied"
        );
      } catch (error) {
        showErrorNotification(
          new Error("Failed to copy address to clipboard"),
          "Copy Failed"
        );
      }
    }
  }

  async function copyPrivateKey() {
    if (unlockedPk) {
      try {
        await navigator.clipboard.writeText(unlockedPk);
        showSuccessNotification(
          "Private key copied to clipboard",
          "Copied"
        );
      } catch (error) {
        showErrorNotification(
          new Error("Failed to copy private key to clipboard"),
          "Copy Failed"
        );
      }
    }
  }

  async function addToken(addr: string) {
    if (!addr.trim()) {
      showErrorNotification(
        new Error("Please enter a token address"),
        "Address Required"
      );
      return;
    }

    // Validate address format
    if (!addr.startsWith('0x') || addr.length !== 42) {
      showErrorNotification(
        new Error("Invalid token address format. Must be a 42-character hex string starting with 0x"),
        "Invalid Address Format"
      );
      return;
    }

    setLoading(true);
    
    try {
      const chain = CHAINS[chainId];
      const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
      
      if (!chain || !rpc) {
        showErrorNotification(
          new Error(`Network configuration not found for chain ID ${chainId}`), 
          "Network Configuration Error"
        );
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
  }

  // Function to add popular tokens for the current network
  function addPopularTokensForNetwork() {
    const popularTokens = getPopularTokens(chainId);
    let addedCount = 0;
    
    for (const token of popularTokens) {
      const newToken: TrackedToken = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
      };
      
      if (addTrackedToken(chainId, newToken)) {
        addedCount++;
      }
    }
    
    // Reload tracked tokens
    setTracked(loadTrackedTokens(chainId));
    
    const networkName = CHAINS[chainId]?.name || `Chain ${chainId}`;
    if (addedCount > 0) {
      showSuccessNotification(
        `Added ${addedCount} popular tokens for ${networkName}`,
        "Popular Tokens Added"
      );
    } else {
      showInfoNotification(
        `All popular tokens for ${networkName} are already being tracked`,
        "No New Tokens Added"
      );
    }
  }

  function cleanupDuplicates() {
    cleanupDuplicateTokens(chainId);
    setTracked(loadTrackedTokens(chainId));
    showSuccessNotification(
      "Duplicate tokens cleaned up",
      "Cleanup Complete"
    );
  }

  async function cleanupInvalidTokens() {
    try {
      setLoading(true);
      const chain = CHAINS[chainId];
      const rpc = DEFAULT_RPC_BY_CHAIN[chainId];
      
      if (!chain || !rpc) {
        showErrorNotification(
          new Error(`Network configuration not found for chain ID ${chainId}`), 
          "Network Configuration Error"
        );
        return;
      }

      const pub = buildPublicClientWithFallback(chain, rpc);
      const validTokens: TrackedToken[] = [];
      let removedCount = 0;

      for (const token of tracked) {
        try {
                     // Try to read token metadata to validate it's a real ERC20
           await readErc20Metadata(pub, token.address as Address);
           validTokens.push(token);
         } catch (error) {
           removedCount++;
         }
      }

      // Save only valid tokens
      saveTrackedTokens(chainId, validTokens);
      setTracked(validTokens);

      if (removedCount > 0) {
        showSuccessNotification(
          `Removed ${removedCount} invalid tokens from tracking`,
          "Cleanup Complete"
        );
      } else {
        showInfoNotification(
          "All tracked tokens are valid",
          "No Cleanup Needed"
        );
      }
    } catch (error) {
      showErrorNotification(error, "Failed to cleanup invalid tokens");
    } finally {
      setLoading(false);
    }
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
        encrypted: JSON.stringify(encrypted), 
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
      
      // Use the validation helper function
      const normalizedPrivateKey = validateAndNormalizePrivateKey(importPrivateKey);
      
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(normalizedPrivateKey as `0x${string}`);
      
      const { encryptSecret } = await import("@/lib/wallet/crypto");
      const encrypted = await encryptSecret(normalizedPrivateKey as `0x${string}`, importPassword);
      
      const walletData = { 
        address: account.address, 
        encrypted: JSON.stringify(encrypted), 
        createdAt: Date.now() 
      };
      
      saveWallet(walletData);
      
      setAddress(account.address);
      setUnlockedPk(normalizedPrivateKey as `0x${string}`);
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
      const pk = (await decryptSecret(JSON.parse(wallet.encrypted), unlockPassword)) as `0x${string}`;
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

  async function recoverWallet() {
    try {
      setLoading(true);
      const wallet = loadWallet();
      if (!wallet) {
        showErrorNotification(
          new Error("No wallet found in localStorage. Please create or import a wallet first."),
          "No Wallet Found"
        );
        return;
      }
      
      if (!unlockPassword) {
        showErrorNotification(
          new Error("Please enter your wallet password to recover it"),
          "Password Required"
        );
        return;
      }
      
      const { decryptSecret } = await import("@/lib/wallet/crypto");
      const pk = (await decryptSecret(JSON.parse(wallet.encrypted), unlockPassword)) as `0x${string}`;
      const { privateKeyToAccount } = await import("viem/accounts");
      const account = privateKeyToAccount(pk);
      
      setAddress(account.address);
      setUnlockedPk(pk);
      setShowPrivateKey(true);
      setShowUnlockModal(false);
      setUnlockPassword("");
      
      showSuccessNotification(
        "Wallet recovered successfully!",
        "Wallet Recovered"
      );
      
      // Automatically refresh balances after recovery
      setTimeout(() => refreshBalances(), 500);
    } catch (error) {
      showErrorNotification(error, "Failed to recover wallet. Please check your password.");
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
            <h1 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">DeBank - Wallet</h1>
            <h1 className="text-2xl font-bold text-[rgb(var(--fg-primary))]">DeBank - Wallet</h1>
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
             
             {!address && (
               <button 
                 onClick={() => setShowUnlockModal(true)}
                 className="btn btn-secondary w-full"
               >
                 <IconDownload size={16} />
                 Recover Wallet
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

      {/* Wallet Balances */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Wallet Balances</h3>
            <div className={`badge ${tracked.length > 0 ? 'badge-success' : ''}`}>
              {tracked.length} tokens tracked
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={refreshPrices}
              className="btn btn-secondary"
              title="Refresh token prices"
              disabled={loading}
            >
              <IconRefresh size={16} />
              <span className="hidden sm:inline">{loading ? "Refreshing..." : "Refresh Prices"}</span>
              <span className="sm:hidden">{loading ? "..." : "Prices"}</span>
            </button>
            <button 
              onClick={cleanupDuplicates}
              className="btn btn-secondary"
              title="Remove duplicate tokens"
            >
              <IconTrash size={16} />
              <span className="hidden sm:inline">Cleanup</span>
            </button>
            <button 
              onClick={cleanupInvalidTokens}
              className="btn btn-secondary"
              title="Remove invalid ERC20 tokens"
              disabled={loading}
            >
              <IconTrash size={16} />
              <span className="hidden sm:inline">{loading ? "Cleaning..." : "Clean Invalid"}</span>
              <span className="sm:hidden">{loading ? "..." : "Invalid"}</span>
            </button>
            <button 
              onClick={() => setShowAddTokenModal(true)}
              className="btn btn-primary"
            >
              <IconPlus size={16} />
              <span className="hidden sm:inline">Add Token</span>
              <span className="sm:hidden">Add</span>
            </button>
            <button 
              onClick={() => setShowSearchTokenModal(true)}
              className="btn btn-primary"
            >
              <IconSearch size={16} />
              <span className="hidden sm:inline">Search</span>
              <span className="sm:hidden">Search</span>
            </button>
            <button 
              onClick={refreshBalances} 
              disabled={!address || loading}
              className="btn btn-secondary"
            >
              <IconRefresh size={16} />
              <span className="hidden sm:inline">Refresh Balances</span>
              <span className="sm:hidden">Refresh</span>
            </button>
          </div>
        </div>
        
        {/* Network-specific token info */}
        <div className="p-3 bg-[rgb(var(--bg-tertiary))] rounded-lg border border-[rgb(var(--border-secondary))] mb-4">
          <p className="text-sm text-[rgb(var(--fg-secondary))]">
            <strong>Current Network:</strong> {CHAINS[chainId]?.name || `Chain ${chainId}`}<br />
            <strong>Note:</strong> Tokens are network-specific. When you switch networks, tokens added on other networks may not be valid. 
            Use &quot;Add Popular Tokens&quot; to quickly add tokens for the current network, or &quot;Clean Invalid&quot; to remove invalid tokens.
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <button 
            onClick={showPopularTokens}
            className="btn btn-secondary"
          >
            View Popular Tokens
          </button>
          <button 
            onClick={addPopularTokensForNetwork}
            className="btn btn-primary"
          >
            Add Popular Tokens
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
                    <th className="text-left py-2 px-2 w-24">Symbol</th>
                    <th className="text-left py-2 px-2 flex-1">Balance</th>
                    <th className="text-left py-2 px-2 w-24 hidden sm:table-cell">Price</th>
                    <th className="text-left py-2 px-2 w-28">USD Value</th>
                    <th className="text-left py-2 px-2 w-16">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(balances).map(([key, value], index) => {
                    if (key === "native") return null;
                    const token = tracked.find(t => t.address === key);
                    if (!token) return null;
                    
                    const balance = typeof value === 'string' ? parseFloat(value) : 0;
                    const price = prices[key] || 0;
                    const usdValue = balance * price;
                    
                    return (
                      <tr key={`balance-${key}-${index}`} className="border-b border-[rgb(var(--border-primary))] hover:bg-[rgb(var(--bg-secondary))]">
                        <td className="py-2 px-2">
                          <div>
                            <span className="font-semibold text-wrap">{token.symbol}</span>
                            {token.name && (
                              <div className="text-xs text-[rgb(var(--fg-secondary))] hidden sm:block text-wrap">{token.name}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div>
                            <div className="text-sm sm:text-base font-mono">{balance.toFixed(6)}</div>
                            <div className="text-xs text-[rgb(var(--fg-secondary))] hidden sm:block text-wrap">{token.address.slice(0, 8)}...{token.address.slice(-6)}</div>
                          </div>
                        </td>
                        <td className="py-2 px-2 hidden sm:table-cell">
                          {price > 0 ? (
                            <span className="text-green-400 font-mono">${price.toFixed(4)}</span>
                          ) : (
                            <span className="text-[rgb(var(--fg-secondary))]">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {usdValue > 0 ? (
                            <span className="font-semibold text-blue-400 font-mono">${usdValue.toFixed(2)}</span>
                          ) : (
                            <span className="text-[rgb(var(--fg-secondary))]">—</span>
                          )}
                          {/* Show price on mobile */}
                          <div className="text-xs text-[rgb(var(--fg-secondary))] sm:hidden">
                            {price > 0 ? `@ $${price.toFixed(4)}` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button 
                            onClick={() => removeToken(token.address)}
                            className="icon-btn"
                            title="Remove token from tracking"
                          >
                            <IconTrash size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Tracked Tokens with Zero Balance */}
          {tracked.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold text-[rgb(var(--fg-primary))] mb-3">Tracked Tokens (No Balance)</h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgb(var(--border-primary))]">
                      <th className="text-left py-2 px-2 w-24">Symbol</th>
                      <th className="text-left py-2 px-2 flex-1">Name</th>
                      <th className="text-left py-2 px-2 w-32 hidden sm:table-cell">Address</th>
                      <th className="text-left py-2 px-2 w-16">Decimals</th>
                      <th className="text-left py-2 px-2 w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracked
                      .filter(token => !balances[token.address] || parseFloat(balances[token.address]) === 0)
                      .map((token, index) => (
                        <tr key={`tracked-${token.address}-${index}`} className="border-b border-[rgb(var(--border-primary))] hover:bg-[rgb(var(--bg-secondary))]">
                          <td className="py-2 px-2">
                            <span className="font-semibold text-wrap">{token.symbol}</span>
                          </td>
                          <td className="py-2 px-2">
                            <div className="text-wrap text-sm">{token.name}</div>
                            <div className="text-xs text-[rgb(var(--fg-secondary))] sm:hidden">
                              {token.address.slice(0, 8)}...{token.address.slice(-6)}
                            </div>
                          </td>
                          <td className="py-2 px-2 hidden sm:table-cell">
                            <code className="text-xs font-mono text-wrap">
                              {token.address.slice(0, 8)}...{token.address.slice(-6)}
                            </code>
                          </td>
                          <td className="py-2 px-2 text-center">{token.decimals}</td>
                          <td className="py-2 px-2 text-center">
                            <button 
                              onClick={() => removeToken(token.address)}
                              className="icon-btn"
                              title="Remove token from tracking"
                            >
                              <IconTrash size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
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

      {/* Market Data */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">Market Data</h3>
          <div className="flex gap-2">
            <button 
              onClick={fetchGlobalMarketData}
              className="btn btn-secondary"
              disabled={loading}
            >
              <IconRefresh size={16} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button 
              onClick={fetchTrendingData}
              className="btn btn-secondary"
              disabled={loading}
            >
              <IconRefresh size={16} />
              <span className="hidden sm:inline">Trending</span>
            </button>
          </div>
        </div>
        
        {/* Global Market Statistics */}
        {globalData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg">
              <div className="text-sm text-[rgb(var(--fg-secondary))]">Active Cryptocurrencies</div>
              <div className="text-xl font-bold">{globalData.active_cryptocurrencies.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg">
              <div className="text-sm text-[rgb(var(--fg-secondary))]">Total Market Cap</div>
              <div className="text-xl font-bold">${(globalData.total_market_cap.usd / 1e9).toFixed(2)}B</div>
            </div>
            <div className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg">
              <div className="text-sm text-[rgb(var(--fg-secondary))]">24h Volume</div>
              <div className="text-xl font-bold">${(globalData.total_volume.usd / 1e9).toFixed(2)}B</div>
            </div>
            <div className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg">
              <div className="text-sm text-[rgb(var(--fg-secondary))]">Market Change 24h</div>
              <div className={`text-xl font-bold ${globalData.market_cap_change_percentage_24h_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {globalData.market_cap_change_percentage_24h_usd.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        {/* Trending Coins */}
        {trendingCoins.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-[rgb(var(--fg-primary))] mb-3">Trending Coins (24h)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {trendingCoins.slice(0, 6).map((coin) => (
                <div 
                  key={coin.id}
                  className="p-4 bg-[rgb(var(--bg-tertiary))] rounded-lg cursor-pointer hover:bg-[rgb(var(--bg-secondary))] transition-colors"
                  onClick={() => addCoinGeckoToken(coin)}
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={coin.thumb} 
                      alt={coin.symbol}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{coin.symbol.toUpperCase()}</div>
                      <div className="text-sm text-[rgb(var(--fg-secondary))]">{coin.name}</div>
                    </div>
                    <div className="text-xs text-[rgb(var(--fg-tertiary))]">
                      Score: {coin.score.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Market Data for Tracked Tokens */}
        {marketData.length > 0 && (
          <div>
            <h4 className="text-md font-semibold text-[rgb(var(--fg-primary))] mb-3">Tracked Tokens Market Data</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgb(var(--border-primary))]">
                    <th className="text-left py-2 px-2">Token</th>
                    <th className="text-left py-2 px-2">Price</th>
                    <th className="text-left py-2 px-2 hidden sm:table-cell">24h Change</th>
                    <th className="text-left py-2 px-2 hidden lg:table-cell">Market Cap</th>
                    <th className="text-left py-2 px-2 hidden lg:table-cell">Volume</th>
                    <th className="text-left py-2 px-2">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {marketData.map((token) => (
                    <tr key={token.id} className="border-b border-[rgb(var(--border-primary))] hover:bg-[rgb(var(--bg-secondary))]">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <img 
                            src={token.image} 
                            alt={token.symbol}
                            className="w-6 h-6 rounded-full"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div>
                            <div className="font-semibold">{token.symbol.toUpperCase()}</div>
                            <div className="text-xs text-[rgb(var(--fg-secondary))]">{token.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-semibold">${token.current_price.toFixed(4)}</div>
                      </td>
                      <td className="py-2 px-2 hidden sm:table-cell">
                        <div className={`font-semibold ${token.price_change_percentage_24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {token.price_change_percentage_24h.toFixed(2)}%
                        </div>
                      </td>
                      <td className="py-2 px-2 hidden lg:table-cell">
                        <div className="text-sm">
                          ${(token.market_cap / 1e6).toFixed(0)}M
                        </div>
                      </td>
                      <td className="py-2 px-2 hidden lg:table-cell">
                        <div className="text-sm">
                          ${(token.total_volume / 1e6).toFixed(0)}M
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="text-sm text-[rgb(var(--fg-secondary))]">#{token.market_cap_rank}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto">
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
              
              <div className="flex flex-col sm:flex-row gap-2 pt-4">
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

        {/* Unlock/Recover Wallet Modal */}
        {showUnlockModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">
                  {address ? "Unlock Wallet" : "Recover Wallet"}
                </h3>
                <button onClick={() => setShowUnlockModal(false)} className="icon-btn">
                  <IconX size={16} />
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-[rgb(var(--fg-secondary))]">
                  {address 
                    ? "Enter your wallet password to unlock it."
                    : "Enter your wallet password to recover it from localStorage."
                  }
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
                
                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <button 
                    onClick={() => setShowUnlockModal(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={address ? unlock : recoverWallet}
                    disabled={!unlockPassword || loading}
                    className="btn btn-primary flex-1"
                  >
                    {loading 
                      ? (address ? "Unlocking..." : "Recovering...") 
                      : (address ? "Unlock" : "Recover")
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Wallet Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto">
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
                
                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <button 
                    onClick={() => setShowImportModal(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button 
                                         onClick={() => {
                       importWallet();
                     }}
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto">
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
                
                <div className="flex flex-col sm:flex-row gap-2 pt-4">
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))] rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto">
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
                        className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        onClick={() => addPopularToken(token)}
                      >
                        <span className="text-sm">{token.symbol} ({token.name})</span>
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