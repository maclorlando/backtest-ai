import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { AssetId, PricesByAsset, PricePoint } from "./types";

// Re-export Alchemy functions as the main price fetching functions
export {
  fetchPricesForBacktest,
  fetchCurrentPricesUSD,
  checkPriceDataAvailability,
  fetchPrices,
  fetchCoinLogos,
  fetchCoinData,
  fetchMarketData,
  fetchTrendingCoins,
  searchCoins,
  fetchGlobalData,
  fetchOHLCData,
  globalRateLimit,
  resetRateLimitState,
  getRateLimitStatus,
  waitForRateLimitReset,
  type CoinGeckoMarketData,
  type CoinGeckoGlobalData,
  type CoinGeckoCoin,
} from "./prices-alchemy";