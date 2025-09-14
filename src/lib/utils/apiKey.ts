/**
 * Utility functions for managing CoinGecko API key from localStorage
 */

/**
 * Get the CoinGecko API key from localStorage
 * Returns undefined if not available (client-side only)
 */
export function getCoinGeckoApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("bt_cg_key") || undefined;
}

/**
 * Set the CoinGecko API key in localStorage
 * Only works on client-side
 */
export function setCoinGeckoApiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("bt_cg_key", key.trim());
}

/**
 * Remove the CoinGecko API key from localStorage
 * Only works on client-side
 */
export function removeCoinGeckoApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("bt_cg_key");
}

/**
 * Check if a CoinGecko API key is configured
 * Only works on client-side
 */
export function hasCoinGeckoApiKey(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("bt_cg_key");
}
