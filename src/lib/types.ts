export type AssetId =
  | "bitcoin"
  | "ethereum"
  | "solana"
  | "usd-coin"
  | "tether"
  | "pepe"
  | "polkadot"
  | "aave"
  | "chainlink"
  | "fartcoin";

export interface PortfolioAsset {
  id: AssetId;
  allocation: number; // 0..1
}

export interface BacktestRequest {
  assets: PortfolioAsset[];
  startDate: string; // ISO date
  endDate: string; // ISO date
  rebalance: {
    mode: "none" | "periodic" | "threshold";
    periodDays?: number; // for periodic
    thresholdPct?: number; // e.g., 5 means 5%
  };
  initialCapital?: number; // default 100
  riskFreeRatePct?: number; // annualized, default 0
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number; // in USD
}

export interface PricesByAsset {
  [assetId: string]: PricePoint[];
}

export interface PortfolioPoint {
  date: string;
  value: number;
}

export interface BacktestSeries {
  timeline: string[]; // YYYY-MM-DD
  portfolio: PortfolioPoint[];
  perAssetValues: Record<string, number[]>; // aligned with timeline
  perAssetPrices?: Record<string, number[]>; // aligned with timeline
  perAssetWeights?: Record<string, number[]>; // aligned with timeline
}

export interface BacktestMetrics {
  startDate: string;
  endDate: string;
  tradingDays: number;
  initialCapital: number;
  finalValue: number;
  cumulativeReturnPct: number;
  cagrPct: number;
  volatilityPct: number; // annualized, using daily std * sqrt(252)
  sharpe: number | null;
  maxDrawdownPct: number;
  bestDayPct: number;
  worstDayPct: number;
}

export interface BacktestResponse {
  series: BacktestSeries;
  metrics: BacktestMetrics;
}

// Aave-specific types
export interface AavePoolInfo {
  symbol: string;
  address: string;
  totalSupply: string;
  totalBorrow: string;
  supplyAPY: number;
  borrowAPY: number;
  utilizationRate: number;
  liquidity: string;
  price: number;
}

export interface AaveUserPosition {
  asset: string;
  symbol: string;
  supplied: string;
  borrowed: string;
  supplyAPY: number;
  borrowAPY: number;
  collateral: boolean;
  healthFactor: number;
  ltv: number;
  usdValue: number;
}

export interface AaveUserSummary {
  totalSupplied: number;
  totalBorrowed: number;
  totalCollateral: number;
  healthFactor: number;
  availableBorrow: number;
  liquidationThreshold: number;
  ltv: number;
}

export const ASSET_ID_TO_SYMBOL: Record<AssetId, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  "usd-coin": "USDC",
  tether: "USDT",
  pepe: "PEPE",
  polkadot: "DOT",
  aave: "AAVE",
  chainlink: "LINK",
  fartcoin: "FART",
};

export const SYMBOL_TO_ASSET_ID: Record<string, AssetId> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  PEPE: "pepe",
  DOT: "polkadot",
  AAVE: "aave",
  LINK: "chainlink",
  FART: "fartcoin",
};


