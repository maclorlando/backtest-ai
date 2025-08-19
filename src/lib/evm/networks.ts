import { Chain, defineChain } from "viem";
import { 
  sepolia, 
  arbitrumSepolia, 
  baseSepolia,
  mainnet,
  arbitrum,
  avalanche,
  base,
  bsc,
  celo,
  gnosis,
  linea,
  metis,
  optimism,
  polygon,
  scroll,
  zkSync,
} from "viem/chains";

export type SupportedChain = Chain;

export const CHAINS: Record<number, Chain> = {
  // Testnets
  [sepolia.id]: sepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [baseSepolia.id]: baseSepolia,
  
  // Mainnets
  [mainnet.id]: mainnet,
  [arbitrum.id]: arbitrum,
  [avalanche.id]: avalanche,
  [base.id]: base,
  [bsc.id]: bsc,
  [celo.id]: celo,
  [gnosis.id]: gnosis,
  [linea.id]: linea,
  [metis.id]: metis,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [scroll.id]: scroll,
  [zkSync.id]: zkSync,
};

export const DEFAULT_RPC_BY_CHAIN: Record<number, string> = {
  // Testnets
  [sepolia.id]: "https://eth-sepolia.g.alchemy.com/v2/demo",
  [arbitrumSepolia.id]: "https://sepolia-rollup.arbitrum.io/rpc",
  [baseSepolia.id]: "https://sepolia.base.org",
  
  // Mainnets - Using more reliable public RPCs
  [mainnet.id]: "https://ethereum.publicnode.com", // More reliable than llamarpc
  [arbitrum.id]: "https://arbitrum-one.publicnode.com", // More reliable than official
  [avalanche.id]: "https://api.avax.network/ext/bc/C/rpc",
  [base.id]: "https://base.publicnode.com", // More reliable than official
  [bsc.id]: "https://bsc-dataseed.binance.org",
  [celo.id]: "https://forno.celo.org",
  [gnosis.id]: "https://rpc.gnosischain.com",
  [linea.id]: "https://rpc.linea.build",
  [metis.id]: "https://andromeda.metis.io/?owner=1088",
  [optimism.id]: "https://optimism.publicnode.com", // More reliable than official
  [polygon.id]: "https://polygon.publicnode.com", // More reliable than official
  [scroll.id]: "https://rpc.scroll.io",
  [zkSync.id]: "https://mainnet.era.zksync.io",
};

// Fallback RPC URLs for better reliability
export const FALLBACK_RPC_BY_CHAIN: Record<number, string[]> = {
  [sepolia.id]: [
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia.publicnode.com",
    "https://sepolia.drpc.org"
  ],
  [arbitrumSepolia.id]: [
    "https://sepolia-rollup.arbitrum.io/rpc",
    "https://arbitrum-sepolia.publicnode.com"
  ],
  [baseSepolia.id]: [
    "https://sepolia.base.org",
    "https://base-sepolia.publicnode.com"
  ],
  [mainnet.id]: [
    "https://ethereum.publicnode.com",
    "https://eth.drpc.org",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com"
  ],
  [arbitrum.id]: [
    "https://arbitrum-one.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.drpc.org"
  ],
  [base.id]: [
    "https://base.publicnode.com",
    "https://mainnet.base.org",
    "https://base.drpc.org"
  ],
  [optimism.id]: [
    "https://optimism.publicnode.com",
    "https://mainnet.optimism.io",
    "https://optimism.drpc.org"
  ],
  [polygon.id]: [
    "https://polygon.publicnode.com",
    "https://polygon-rpc.com",
    "https://polygon.drpc.org"
  ],
};