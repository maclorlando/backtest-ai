"use client";
import type { EncryptedSecret } from "./crypto";

export type StoredWallet = {
  encrypted: string;
  createdAt: number;
  address?: string; // cached for faster UI
};

const WALLET_KEY = "bt_wallet_v1";

// Migration function to handle old wallet format
function migrateWalletData(raw: string): StoredWallet | null {
  try {
    const data = JSON.parse(raw);
    
    // Handle old format with 'type' field
    if (data.type === "pk" || data.type === undefined) {
      return {
        encrypted: data.encrypted,
        createdAt: data.createdAt || Date.now(),
        address: data.address
      };
    }
    
    // Handle new format
    return data;
  } catch {
    return null;
  }
}

export function saveWallet(w: StoredWallet) {
  localStorage.setItem(WALLET_KEY, JSON.stringify(w));
}

export function loadWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (!raw) return null;
    
    // Try to migrate old format
    const migrated = migrateWalletData(raw);
    if (migrated) {
      // Save the migrated format
      saveWallet(migrated);
      return migrated;
    }
    
    return JSON.parse(raw) as StoredWallet;
  } catch {
    return null;
  }
}

export function clearWallet() {
  localStorage.removeItem(WALLET_KEY);
}

export type TrackedToken = { address: string; symbol: string; decimals: number; name?: string };

export function loadTrackedTokens(chainId: number): TrackedToken[] {
  try {
    const raw = localStorage.getItem(`bt_tracked_tokens_${chainId}`);
    return raw ? (JSON.parse(raw) as TrackedToken[]) : [];
  } catch {
    return [];
  }
}

export function saveTrackedTokens(chainId: number, tokens: TrackedToken[]) {
  localStorage.setItem(`bt_tracked_tokens_${chainId}`, JSON.stringify(tokens));
}

// Comprehensive token database for popular tokens across different networks
export const POPULAR_TOKENS = {
  // Ethereum Mainnet
  1: [
    { symbol: "WETH", name: "Wrapped Ether", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", name: "Tether USD", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    { symbol: "AAVE", name: "Aave", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", decimals: 18 },
    { symbol: "LINK", name: "Chainlink", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    { symbol: "UNI", name: "Uniswap", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
    { symbol: "CRV", name: "Curve DAO Token", address: "0xD533a949740bb3306d119CC777fa900bA034cd52", decimals: 18 },
    { symbol: "MKR", name: "Maker", address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18 },
    { symbol: "COMP", name: "Compound", address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18 },
    { symbol: "SNX", name: "Synthetix", address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18 },
    { symbol: "YFI", name: "yearn.finance", address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad9eC", decimals: 18 },
    { symbol: "BAL", name: "Balancer", address: "0xba100000625a3754423978a60c9317c58a424e3D", decimals: 18 },
    { symbol: "SUSHI", name: "SushiSwap", address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", decimals: 18 },
    { symbol: "1INCH", name: "1inch", address: "0x111111111117dC0aa78b770fA6A738034120C302", decimals: 18 },
    { symbol: "ENS", name: "Ethereum Name Service", address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72", decimals: 18 },
    { symbol: "SHIB", name: "Shiba Inu", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", decimals: 18 },
    { symbol: "PEPE", name: "Pepe", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", decimals: 18 },
    { symbol: "DOGE", name: "Dogecoin", address: "0x3832d2F059E55934220881F831bE501D180671A7", decimals: 18 },
    { symbol: "MATIC", name: "Polygon", address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608aCafEBB0", decimals: 18 },
  ],
  // Base Mainnet
  8453: [
    { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "USDbC", name: "USD Base Coin", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6 },
    { symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 },
    { symbol: "DAI", name: "Dai Stablecoin", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    { symbol: "BAL", name: "Balancer", address: "0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1", decimals: 18 },
    { symbol: "CRV", name: "Curve DAO Token", address: "0x7122985656e38BDC0302Db86685bb972b145bD3C", decimals: 18 },
    { symbol: "SNX", name: "Synthetix", address: "0x22e6966B799c4D5B13BE963E8e3cA27b1eC8458b", decimals: 18 },
    { symbol: "UNI", name: "Uniswap", address: "0x6fd9d7AD17242c41f7131d257212c54A0e816691", decimals: 18 },
    { symbol: "AAVE", name: "Aave", address: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8", decimals: 18 },
  ],
  // Arbitrum One
  42161: [
    { symbol: "WETH", name: "Wrapped Ether", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6 },
    { symbol: "USDT", name: "Tether USD", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
    { symbol: "LINK", name: "Chainlink", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18 },
    { symbol: "UNI", name: "Uniswap", address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", decimals: 18 },
    { symbol: "ARB", name: "Arbitrum", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
    { symbol: "SPELL", name: "Spell Token", address: "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF", decimals: 18 },
    { symbol: "MAGIC", name: "Magic", address: "0x539bdE0d7Dbd336b79148AA742883198BBF60342", decimals: 18 },
    { symbol: "GMX", name: "GMX", address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18 },
    { symbol: "RDNT", name: "Radiant Capital", address: "0x3082CC23568eA640225c2467653dB90e9250AaA0", decimals: 18 },
    { symbol: "STG", name: "Stargate Finance", address: "0x6694340fc020c5E6B96567843da2df01b2CE1eb6", decimals: 18 },
  ],
  // Polygon
  137: [
    { symbol: "WMATIC", name: "Wrapped MATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
    { symbol: "USDT", name: "Tether USD", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "WETH", name: "Wrapped Ether", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
    { symbol: "AAVE", name: "Aave", address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18 },
    { symbol: "CRV", name: "Curve DAO Token", address: "0x172370d5Cd63279eFa6d502DAB29171933a610AF", decimals: 18 },
    { symbol: "BAL", name: "Balancer", address: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", decimals: 18 },
    { symbol: "QUICK", name: "QuickSwap", address: "0xB5C064F955D8e7F38fE0460C556a72987494eE17", decimals: 18 },
    { symbol: "SUSHI", name: "SushiSwap", address: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", decimals: 18 },
  ],
  // Optimism
  10: [
    { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6 },
    { symbol: "USDT", name: "Tether USD", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", decimals: 8 },
    { symbol: "OP", name: "Optimism", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    { symbol: "SNX", name: "Synthetix", address: "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4", decimals: 18 },
    { symbol: "VELO", name: "Velodrome", address: "0x3c8B650257cFb5f272f799F5e2b4e65093a11a05", decimals: 18 },
    { symbol: "PERP", name: "Perpetual Protocol", address: "0x9e1028F5F1D5eDE59748FFceE5532509976840E0", decimals: 18 },
  ],
  // Avalanche
  43114: [
    { symbol: "WAVAX", name: "Wrapped AVAX", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18 },
    { symbol: "USDC", name: "USD Coin", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    { symbol: "USDT", name: "Tether USD", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
    { symbol: "WETH", name: "Wrapped Ether", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", decimals: 18 },
    { symbol: "WBTC", name: "Wrapped Bitcoin", address: "0x50b7545627a5162F82A992c33b87aDc75187B218", decimals: 8 },
    { symbol: "AAVE", name: "Aave", address: "0x63a72806098Bd3D9520cC43356dD78afe5D386D9", decimals: 18 },
    { symbol: "JOE", name: "Trader Joe", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", decimals: 18 },
    { symbol: "PNG", name: "Pangolin", address: "0x60781C2586D68229fde47564546784ab3fACA982", decimals: 18 },
  ],
} as const;

/**
 * Search for tokens by symbol or name
 */
export function searchTokens(chainId: number, query: string): Array<{ symbol: string; name: string; address: string; decimals: number }> {
  const tokens = POPULAR_TOKENS[chainId as keyof typeof POPULAR_TOKENS] || [];
  const lowerQuery = query.toLowerCase();
  
  return tokens.filter(token => 
    token.symbol.toLowerCase().includes(lowerQuery) ||
    token.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get all popular tokens for a chain
 */
export function getPopularTokens(chainId: number): Array<{ symbol: string; name: string; address: string; decimals: number }> {
  return POPULAR_TOKENS[chainId as keyof typeof POPULAR_TOKENS] || [];
}

/**
 * Add a token to the tracked list for a specific wallet and chain
 */
export function addTrackedToken(chainId: number, token: TrackedToken) {
  const currentTokens = loadTrackedTokens(chainId);
  const exists = currentTokens.some(t => t.address.toLowerCase() === token.address.toLowerCase());
  
  if (!exists) {
    const updatedTokens = [...currentTokens, token];
    saveTrackedTokens(chainId, updatedTokens);
    return true; // Token was added
  }
  
  return false; // Token already exists
}

/**
 * Remove a token from the tracked list
 */
export function removeTrackedToken(chainId: number, tokenAddress: string) {
  const currentTokens = loadTrackedTokens(chainId);
  const updatedTokens = currentTokens.filter(t => t.address.toLowerCase() !== tokenAddress.toLowerCase());
  saveTrackedTokens(chainId, updatedTokens);
}

/**
 * Check if a token is being tracked
 */
export function isTokenTracked(chainId: number, tokenAddress: string): boolean {
  const currentTokens = loadTrackedTokens(chainId);
  return currentTokens.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
}

/**
 * Clean up duplicate tokens from the tracked list
 */
export function cleanupDuplicateTokens(chainId: number) {
  const currentTokens = loadTrackedTokens(chainId);
  const uniqueTokens: TrackedToken[] = [];
  const seenAddresses = new Set<string>();
  
  for (const token of currentTokens) {
    const lowerAddress = token.address.toLowerCase();
    if (!seenAddresses.has(lowerAddress)) {
      seenAddresses.add(lowerAddress);
      uniqueTokens.push(token);
    }
  }
  
  // Only save if we actually removed duplicates
  if (uniqueTokens.length !== currentTokens.length) {
    saveTrackedTokens(chainId, uniqueTokens);
    console.log(`Cleaned up ${currentTokens.length - uniqueTokens.length} duplicate tokens for chain ${chainId}`);
  }
  
  return uniqueTokens;
}