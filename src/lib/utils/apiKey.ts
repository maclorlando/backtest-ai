/**
 * Utility functions for managing API keys from localStorage
 * Note: Alchemy API key is now handled via environment variables
 */

/**
 * Get the CoinGecko API key from localStorage (legacy support)
 * Returns undefined if not available (client-side only)
 * @deprecated Use environment variables for Alchemy API key instead
 */
export function getCoinGeckoApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("bt_cg_key") || undefined;
}

/**
 * Set the CoinGecko API key in localStorage (legacy support)
 * Only works on client-side
 * @deprecated Use environment variables for Alchemy API key instead
 */
export function setCoinGeckoApiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("bt_cg_key", key.trim());
}

/**
 * Remove the CoinGecko API key from localStorage (legacy support)
 * Only works on client-side
 * @deprecated Use environment variables for Alchemy API key instead
 */
export function removeCoinGeckoApiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("bt_cg_key");
}

/**
 * Check if a CoinGecko API key is configured (legacy support)
 * Only works on client-side
 * @deprecated Use environment variables for Alchemy API key instead
 */
export function hasCoinGeckoApiKey(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("bt_cg_key");
}
